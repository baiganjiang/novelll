import { GoogleGenAI } from '@google/genai';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Character, AIProfile, Lore } from '../types';

// Global environment detection
const isBrowser = typeof window !== 'undefined';
// Check if we are actually running in a native mobile environment
const isNative = isBrowser && (Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:');

// Safely access environment variables
const getEnv = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      return (import.meta as any).env[key] || '';
    }
  } catch (e) {}
  return '';
};

// Use proxy in web browser environments (including local dev and preview) to avoid CORS
// Native apps (Capacitor) use native HTTP which bypasses CORS
const useProxy = isBrowser && !isNative;

async function callAI(
  systemInstruction: string,
  prompt: string,
  history: { role: 'user' | 'model'; text: string }[],
  profile: AIProfile
): Promise<string> {
  if (profile.provider === 'custom') {
    const apiKey = (profile.key || '').trim();
    const apiUrl = (profile.url || '').trim();

    if (!apiKey) {
      throw new Error("未提供 API Key。请在左侧设置 -> AI 接口管理中，为你当前使用的自定义 AI 配置 API Key。");
    }
    if (!apiUrl) {
      throw new Error("未提供 API Base URL。请在设置中配置。");
    }

    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text })),
      { role: 'user', content: prompt }
    ];

    let fetchUrl = apiUrl.trim();
    if (!fetchUrl.endsWith('/chat/completions') && !fetchUrl.endsWith('/completions')) {
      fetchUrl = fetchUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    try {
      if (useProxy) {
        // Web: Use our backend proxy (built-in to the preview environment)
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const proxyUrl = `${origin}/api/chat`;
        
        console.log(`[AI Service] Web Proxy Request to: ${proxyUrl} for API: ${apiUrl}`);
        
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: apiUrl,
            key: apiKey,
            model: profile.model,
            messages,
            temperature: profile.temperature,
          })
        });
        if (!response.ok) {
          const errText = await response.text();
          console.error(`[AI Service] Proxy Error Response:`, errText);
          throw new Error(`API 错误: ${response.status} - ${errText}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "AI 没有返回内容";
      } else if (isNative) {
        // Mobile Native: Use CapacitorHttp to bypass CORS
        const response = await CapacitorHttp.post({
          url: fetchUrl,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          data: {
            model: profile.model,
            messages,
            temperature: profile.temperature,
          }
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`API 错误: ${response.status} - ${JSON.stringify(response.data)}`);
        }
        return response.data.choices?.[0]?.message?.content || "AI 没有返回内容";
      } else {
        // Other (Local/Direct/Node): Direct call
        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: profile.model,
            messages,
            temperature: profile.temperature,
          })
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`API 错误: ${response.status} - ${errText}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || "AI 没有返回内容";
      }
    } catch (error: any) {
      throw new Error(`请求失败: ${error.message}。请检查网络或 API 地址是否正确。`);
    }
  } else {
    // Use Gemini API
    const envApiKey = getEnv('VITE_GEMINI_API_KEY');
    const apiKey = (profile.key || envApiKey || '').trim();
    
    if (!apiKey && !useProxy) {
      throw new Error("未配置 Gemini API Key。请在设置中配置。");
    }

    const historyText = history.map(m => `${m.role === 'user' ? '作者' : 'AI助手'}: ${m.text}`).join('\n\n');
    const fullPrompt = `${historyText ? `历史对话记录:\n${historyText}\n\n` : ''}作者: ${prompt}\nAI助手: `;

    try {
      if (useProxy) {
        // Web: Use backend proxy for Gemini
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const proxyUrl = `${origin}/api/chat/gemini`;
        
        console.log(`[AI Service] Gemini Proxy Request to: ${proxyUrl}`);
        
        const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: profile.model,
            contents: fullPrompt,
            config: {
              systemInstruction,
              temperature: profile.temperature,
            }
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({ error: '无法解析错误响应' }));
          console.error(`[AI Service] Gemini Proxy Error:`, errData);
          throw new Error(`Gemini 服务器错误: ${response.status} - ${errData.error || '未知错误'}`);
        }
        const data = await response.json();
        return data.text || "AI 没有返回内容。";
      } else {
        // Mobile Native or Direct: Use SDK
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: profile.model,
          contents: fullPrompt,
          config: {
            systemInstruction,
            temperature: profile.temperature,
          }
        });
        return response.text || "AI 没有返回内容。";
      }
    } catch (error: any) {
      throw new Error(`Gemini 请求失败: ${error.message}`);
    }
  }
}

export async function generateChapterSummary(content: string, profile: AIProfile): Promise<string> {
  if (!content || !content.trim()) {
    return "章节内容为空，无法生成摘要。";
  }

  try {
    const systemInstruction = "你是一个专业的小说编辑。";
    const prompt = `请为以下小说章节内容生成详细的摘要。
请严格按照以下格式回复，不要输出任何其他多余的解释文字，也不要输出 JSON：

1. 发生了什么内容：[详细描述本章发生的剧情]

2. 有哪一些角色：
- [角色A]：[角色A的身份及本章作用]
- [角色B]：[角色B的身份及本章作用]
（请尽可能全面地列出所有出场角色）

3. 角色的关系：[描述本章中主要角色之间的关系和互动]

小说章节内容：
${content}`;
    
    const responseText = await callAI(systemInstruction, prompt, [], profile);
    
    // Remove <think>...</think> blocks if present
    const cleanedText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    return cleanedText;
  } catch (error: any) {
    console.error("Error generating summary:", error);
    throw new Error(`生成摘要时发生错误: ${error.message}`);
  }
}

export async function extractLoreFromText(text: string, profile: AIProfile): Promise<Partial<Lore>[]> {
  if (!text || text.trim().length === 0) return [];

  try {
    const systemInstruction = "你是一个专业的小说世界观设定提取器。";
    const prompt = `请从以下小说文本中提取出新的世界观设定（例如：特殊的地点、法宝、功法、组织势力、境界等级、特殊规则等）。
请以严格的 JSON 数组格式返回，包含字段：name (设定名称), category (类别，如地点/法宝/功法/势力/境界/规则等), description (详细描述)。
不要返回任何其他说明文字，只返回 JSON 数组。如果找不到设定，返回空数组 []。

文本内容：
${text.substring(0, 60000)}`;

    const responseText = await callAI(systemInstruction, prompt, [], profile);
    
    // Remove <think>...</think> blocks if present
    const cleanedText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Extract JSON from markdown block if present
    const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, cleanedText];
    let jsonString = jsonMatch[1].trim();
    
    let lores: any = null;
    try {
      lores = JSON.parse(jsonString);
    } catch (e) {
      // Fallback: try to find the first [ and last ] or { and }
      const arrayStart = jsonString.indexOf('[');
      const arrayEnd = jsonString.lastIndexOf(']');
      const objStart = jsonString.indexOf('{');
      const objEnd = jsonString.lastIndexOf('}');
      
      let parsed = false;
      
      // Try array first if it looks like an array
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        try {
          lores = JSON.parse(jsonString.substring(arrayStart, arrayEnd + 1));
          parsed = true;
        } catch (e2) {
          // Ignore and try object fallback
        }
      }
      
      // Try object if array failed or wasn't found
      if (!parsed && objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
        try {
          lores = JSON.parse(jsonString.substring(objStart, objEnd + 1));
          parsed = true;
        } catch (e3) {
          // Ignore
        }
      }
      
      if (!parsed) {
        console.error("Failed to parse JSON even with fallback:", jsonString);
        return [];
      }
    }
    
    // Handle case where AI returns an object with a lores array
    if (lores && typeof lores === 'object' && !Array.isArray(lores)) {
      if (Array.isArray(lores.lores)) {
        lores = lores.lores;
      } else if (Array.isArray(lores.settings)) {
        lores = lores.settings;
      } else {
        // Try to find any array value in the object
        const arrayValues = Object.values(lores).filter(v => Array.isArray(v));
        if (arrayValues.length > 0) {
          lores = arrayValues[0];
        }
      }
    }

    if (Array.isArray(lores)) {
      return lores;
    }
    return [];
  } catch (error) {
    console.error("Error extracting lore:", error);
    return [];
  }
}

export async function generateGlobalOutline(chapterSummaries: string[], profile: AIProfile): Promise<string> {
  if (!chapterSummaries || chapterSummaries.length === 0) {
    return "没有提供章节摘要，无法生成全书大纲。";
  }

  try {
    const systemInstruction = "你是一个专业的小说大纲策划。";
    const prompt = `请根据以下各章节的摘要，总结并生成一份连贯的全书剧情大纲（包含主线脉络、关键转折和目前的故事进度）。\n\n【各章摘要】\n${chapterSummaries.map((s, i) => `第${i+1}章: ${s}`).join('\n')}`;
    return await callAI(systemInstruction, prompt, [], profile);
  } catch (error: any) {
    console.error("Error generating global outline:", error);
    throw new Error(`生成大纲时发生错误: ${error.message}`);
  }
}

export async function chatWithAI(
  prompt: string,
  globalStyle: string,
  styleExamples: string,
  negativePrompts: string,
  lores: Lore[],
  globalOutline: string,
  chapterContext: string,
  previousSummaries: string,
  characters: Character[],
  history: { role: 'user' | 'model'; text: string }[],
  profile: AIProfile
): Promise<string> {
  try {
    const charactersText = characters.length > 0 
      ? `\n\n【角色设定库】\n${characters.map(c => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}`
      : '';
      
    const examplesText = styleExamples?.trim() 
      ? `\n\n【文笔参考范例】\n请模仿以下文本的语言风格、句式长短和用词习惯进行创作：\n${styleExamples}`
      : '';

    const negativeText = negativePrompts?.trim()
      ? `\n\n【创作禁忌（负面提示词）】\n绝对禁止以下内容：\n${negativePrompts}`
      : '';

    const lorebookText = lores && lores.length > 0
      ? `\n\n【世界设定集 (Lorebook)】\n${lores.map(l => `- 【${l.category}】${l.name}: ${l.description}`).join('\n')}`
      : '';

    const outlineText = globalOutline?.trim()
      ? `\n\n【全书大纲/剧情脉络】\n${globalOutline}`
      : '';

    const previousContextText = previousSummaries?.trim()
      ? `\n\n【前情提要（前几章摘要）】\n${previousSummaries}`
      : '';

    const systemInstruction = `你是一个专业的小说创作助手。
当前正在进行剧情构思讨论。你的目标是协助作者设计既有创意又能完美衔接前文的剧情。

【核心原则 - 严禁脱离主线】：
1. 衔接性：所有的建议必须基于【前情提要】。你必须时刻记住之前发生了什么，不能提出与已有剧情、角色性格或世界观设定冲突的建议。
2. 逻辑性：如果作者提出的想法（如“事件A”）与前文逻辑不符，你必须指出冲突点，并建议如何通过合理的剧情过渡来实现在不破坏逻辑的前提下引入新想法。
3. 引导性：你不是一个简单的复读机。如果作者的思路过于发散，偏离了【全书大纲】，你有责任提醒作者，并尝试将话题引回主线。
4. 整体观：不要只盯着作者最后的一句话。要结合全书大纲和前几章的摘要来评估当前讨论的合理性。

当前的写作风格/方向设定为：${globalStyle || '无特定设定'}。${examplesText}${negativeText}${lorebookText}${outlineText}${charactersText}${previousContextText}
当前正在编辑的章节上下文内容为：
---
${chapterContext ? chapterContext.substring(0, 3000) : '暂无内容'}
---
请根据用户的要求提供创作建议、续写段落、润色文本或解答疑问。请保持符合设定的文风，并严格遵循角色设定和世界观设定。`;

    return await callAI(systemInstruction, prompt, history, profile);
  } catch (error: any) {
    console.error("Error chatting with AI:", error);
    return `对话时发生错误: ${error.message}`;
  }
}

export async function generateChapterOutline(
  chapterTitle: string,
  previousSummaries: string,
  globalOutline: string,
  characters: Character[],
  lores: Lore[],
  profile: AIProfile,
  discussionHistory?: { role: 'user' | 'model'; text: string }[]
): Promise<string> {
  try {
    const systemInstruction = `你是一个专业的小说大纲策划师（Agent 1）。你的任务是为当前章节设计详细的剧情点和发展脉络。

【核心任务】：
1. 综合参考：你必须同时参考【全书大纲】、【前情提要】和【剧情讨论记录】。
2. 逻辑至上：【前情提要】和【全书大纲】是故事的根基。如果【剧情讨论记录】中的新想法与根基冲突，你必须优先保证逻辑连贯，通过在大纲中加入必要的铺垫和过渡来化解冲突，严禁出现剧情断层。
3. 严禁盲从：不要因为作者在讨论中提到了某个点就让整个大纲只围绕那个点转。大纲必须包含章节所需的起承转合，确保其在整部小说中的功能性。`;
    
    const discussionText = discussionHistory && discussionHistory.length > 0
      ? `\n\n【作者最新的剧情讨论/意图】：\n${discussionHistory.map(m => `${m.role === 'user' ? '作者' : '助手'}: ${m.text}`).join('\n')}`
      : '';

    const prompt = `请为章节【${chapterTitle}】设计剧情大纲。
${discussionText}

【全书大纲】：${globalOutline || '无'}
【前情提要（必读，确保逻辑连贯）】：
${previousSummaries || '无'}

【出场角色参考】：${characters.map(c => c.name).join(', ') || '无'}
【世界观设定参考】：${lores.map(l => l.name).join(', ') || '无'}

请直接输出该章节的剧情点列表（如：1. A遇到B；2. 发生冲突；3. 解决问题），不需要其他废话。`;
    const response = await callAI(systemInstruction, prompt, [], profile);
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error: any) {
    console.error("Error generating chapter outline:", error);
    throw error;
  }
}

export async function generateChapterDraft(
  chapterOutline: string,
  globalStyle: string,
  styleExamples: string,
  characters: Character[],
  lores: Lore[],
  profile: AIProfile
): Promise<string> {
  try {
    const systemInstruction = "你是一个专业的小说主笔（Agent 2）。你的任务是根据提供的章节大纲，扩写成完整的小说正文。";
    const prompt = `请根据以下章节大纲，扩写成详细的小说正文。
【章节大纲】：\n${chapterOutline}
【文风要求】：${globalStyle || '无'}
【文笔参考】：${styleExamples || '无'}
【角色设定】：${characters.map(c => `${c.name}: ${c.description}`).join('\n') || '无'}
【世界观设定】：${lores.map(l => `${l.name}: ${l.description}`).join('\n') || '无'}

请直接输出正文内容，不要包含任何多余的解释或标题。`;
    const response = await callAI(systemInstruction, prompt, [], profile);
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error: any) {
    console.error("Error generating chapter draft:", error);
    throw error;
  }
}

export async function polishChapterDraft(
  draft: string,
  globalStyle: string,
  styleExamples: string,
  negativePrompts: string,
  profile: AIProfile
): Promise<string> {
  try {
    const systemInstruction = "你是一个专业的小说精修师（Agent 3）。你的任务是润色和优化提供的小说草稿，使其更符合设定的文风，消除语病，提升表现力。";
    const prompt = `请润色以下小说草稿。
【文风要求】：${globalStyle || '无'}
【文笔参考】：${styleExamples || '无'}
【绝对禁止的内容】：${negativePrompts || '无'}

【原始草稿】：\n${draft}

请直接输出润色后的正文，不要包含任何多余的解释或标题。`;
    const response = await callAI(systemInstruction, prompt, [], profile);
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error: any) {
    console.error("Error polishing chapter draft:", error);
    throw error;
  }
}

export async function extractCharactersFromText(text: string, profile: AIProfile): Promise<Partial<Character>[]> {
  try {
    const systemInstruction = "你是一个专业的小说分析引擎。";
    const prompt = `请从以下文本（可能是小说正文，也可能是剧情摘要）中提取所有的出场角色，请尽可能全面，不要遗漏任何一个有名字或有具体设定的角色。
请以严格的 JSON 数组格式返回，包含字段：name (姓名), role (身份/定位，如主角/配角/反派/路人等), description (外貌、性格、背景、特殊能力等详细设定)。
不要返回任何其他说明文字，只返回 JSON 数组。如果找不到角色，返回空数组 []。
文本内容：\n${text.substring(0, 60000)}`;

    const responseText = await callAI(systemInstruction, prompt, [], profile);
    console.log("Raw AI Response for Characters:", responseText);
    
    // Remove <think>...</think> blocks if present
    const cleanedText = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Extract JSON from markdown block if present
    const jsonMatch = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, cleanedText];
    let jsonString = jsonMatch[1].trim();
    
    let characters: any = null;
    try {
      characters = JSON.parse(jsonString);
    } catch (e) {
      // Fallback: try to find the first [ and last ] or { and }
      const arrayStart = jsonString.indexOf('[');
      const arrayEnd = jsonString.lastIndexOf(']');
      const objStart = jsonString.indexOf('{');
      const objEnd = jsonString.lastIndexOf('}');
      
      let parsed = false;
      
      // Try array first if it looks like an array
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        try {
          characters = JSON.parse(jsonString.substring(arrayStart, arrayEnd + 1));
          parsed = true;
        } catch (e2) {
          // Ignore and try object fallback
        }
      }
      
      // Try object if array failed or wasn't found
      if (!parsed && objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
        try {
          characters = JSON.parse(jsonString.substring(objStart, objEnd + 1));
          parsed = true;
        } catch (e3) {
          // Ignore
        }
      }
      
      if (!parsed) {
        console.error("Failed to parse JSON even with fallback:", jsonString);
        return [];
      }
    }

    console.log("Parsed JSON Object for Characters:", characters);
    
    // Handle case where AI returns an object with a characters array
    if (characters && typeof characters === 'object' && !Array.isArray(characters)) {
      if (Array.isArray(characters.characters)) {
        characters = characters.characters;
      } else {
        // Try to find any array value in the object
        const arrayValues = Object.values(characters).filter(v => Array.isArray(v));
        if (arrayValues.length > 0) {
          characters = arrayValues[0];
        }
      }
    }

    if (Array.isArray(characters)) {
      return characters;
    }
    return [];
  } catch (error) {
    console.error("Error extracting characters:", error);
    return [];
  }
}

export async function brainstormOutline(
  topic: string,
  history: { agentName: string; text: string }[],
  agentRole: string,
  globalOutline: string,
  characters: Character[],
  lores: Lore[],
  profile: AIProfile
): Promise<string> {
  try {
    const systemInstruction = `你是一个小说创作团队中的【${agentRole}】。
你的任务是与其他团队成员一起，通过对话的方式推演和构建未来的剧情大纲方向。
请根据你的角色设定，提出有建设性的剧情建议、冲突设计或人物发展方向。
你的发言应该简明扼要，直接切入主题，并可以对前一位成员的发言进行补充、反驳或延伸。`;

    const historyText = history.map(m => `${m.agentName}: ${m.text}`).join('\n\n');
    
    const prompt = `【当前推演主题/瓶颈】：${topic}
【全书大纲参考】：${globalOutline || '无'}
【角色设定参考】：${characters.map(c => c.name).join(', ') || '无'}
【世界观设定参考】：${lores.map(l => l.name).join(', ') || '无'}

【之前的讨论记录】：
${historyText || '暂无讨论。你是第一个发言的。'}

请以【${agentRole}】的身份进行下一次发言。直接输出你的发言内容，不需要加任何前缀或标题。`;

    const response = await callAI(systemInstruction, prompt, [], profile);
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error: any) {
    console.error("Error brainstorming outline:", error);
    throw error;
  }
}

export async function summarizeBrainstorming(
  topic: string,
  history: { agentName: string; text: string }[],
  profile: AIProfile
): Promise<string> {
  try {
    const systemInstruction = "你是一个专业的小说主编。你的任务是总结团队的讨论记录，提炼出一份可执行的剧情大纲方案。";
    const historyText = history.map(m => `${m.agentName}: ${m.text}`).join('\n\n');
    
    const prompt = `【推演主题】：${topic}

【团队讨论记录】：
${historyText}

请总结以上讨论，提炼出一份清晰、连贯的【未来剧情大纲方向】。直接输出总结内容，不要包含任何多余的解释。`;

    const response = await callAI(systemInstruction, prompt, [], profile);
    return response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  } catch (error: any) {
    console.error("Error summarizing brainstorm:", error);
    throw error;
  }
}
