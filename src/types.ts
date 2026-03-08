export interface Chapter {
  id: string;
  title: string;
  content: string;
  summary: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
}

export interface Lore {
  id: string;
  name: string;
  category: string;
  description: string;
}

export interface Novel {
  id: string;
  title: string;
  globalStyle: string;
  styleExamples: string; // 用于统一文笔的参考范文
  negativePrompts: string; // 负面提示词，用于约束AI
  lorebook: string; // 兼容旧版本，保留为string
  lores?: Lore[]; // 新增的世界设定集数组
  globalOutline?: string; // 全书大纲/剧情脉络 (Map-Reduce生成)
  chapters: Chapter[];
  characters: Character[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

export interface AIProfile {
  id: string;
  name: string;
  provider: 'gemini' | 'custom';
  url?: string;
  key?: string;
  model: string;
  temperature: number;
}

export interface Workspace {
  novels: Novel[];
  activeNovelId: string;
  aiProfiles: AIProfile[];
  activeProfileId: string;
}
