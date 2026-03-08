import React, { useState, useRef, useEffect } from 'react';
import { Book, FileText, Plus, MessageSquare, Settings, Sparkles, Send, Trash2, ChevronRight, ChevronDown, Users, User, Download, Upload, X, Sliders, Wand2, Library, Cpu, Loader2, Monitor, Tablet, Smartphone } from 'lucide-react';
import { Chapter, Novel, ChatMessage, Character, Workspace, AIProfile, Lore } from './types';
import { generateChapterSummary, chatWithAI, extractCharactersFromText, generateGlobalOutline, extractLoreFromText, generateChapterOutline, generateChapterDraft, polishChapterDraft, brainstormOutline, summarizeBrainstorming } from './services/ai';
import { addNovelChunks, searchRelevantContext, clearNovelChunks } from './services/rag';

export interface BrainstormMessage {
  id: string;
  agentName: string;
  agentRole: string;
  text: string;
}

const DEFAULT_AI_PROFILES: AIProfile[] = [
  {
    id: 'default-gemini-flash',
    name: 'Gemini 3 Flash (默认)',
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    temperature: 0.7
  },
  {
    id: 'default-gemini-pro',
    name: 'Gemini 3.1 Pro (推理)',
    provider: 'gemini',
    model: 'gemini-3.1-pro-preview',
    temperature: 0.7
  }
];

const DEFAULT_NOVEL: Novel = {
  id: 'novel-1',
  title: '未命名小说',
  globalStyle: '文风：轻松幽默\n背景：现代都市\n核心设定：主角拥有一家可以连接异世界的杂货铺。',
  styleExamples: '',
  negativePrompts: '禁止使用现代网络用语、禁止使用过于华丽空洞的辞藻、多用动词少用形容词',
  lorebook: '',
  lores: [
    { id: 'lore-1', name: '杂货铺', category: '地点', description: '一家看似普通，实则能连接各个位面的神秘店铺。' },
    { id: 'lore-2', name: '灵石', category: '物品', description: '异世界的通用货币。' }
  ],
  globalOutline: '',
  chapters: [
    {
      id: '1',
      title: '第一章：神秘的杂货铺',
      content: '夜幕降临，老街尽头的杂货铺亮起了一盏昏黄的灯。李明推开吱呀作响的木门，一阵夹杂着海腥味和奇异香料的气息扑面而来...',
      summary: '李明在夜晚进入了一家神秘的杂货铺，感受到了奇异的气息，故事由此展开。',
    }
  ],
  characters: [
    {
      id: 'c1',
      name: '李明',
      role: '主角',
      description: '25岁，杂货铺老板。表面上是个普通的年轻人，实际上拥有能看穿物品“前世今生”的异能。性格随和，有些财迷。'
    }
  ]
};

export default function App() {
  // --- Workspace State (Persisted) ---
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const saved = localStorage.getItem('ai-novel-workspace');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse workspace from local storage");
      }
    }
    return {
      novels: [DEFAULT_NOVEL],
      activeNovelId: DEFAULT_NOVEL.id,
      aiProfiles: DEFAULT_AI_PROFILES,
      activeProfileId: DEFAULT_AI_PROFILES[0].id
    };
  });

  // Save to local storage whenever workspace changes
  useEffect(() => {
    localStorage.setItem('ai-novel-workspace', JSON.stringify(workspace));
  }, [workspace]);

  // Derived active entities
  const activeNovel = workspace.novels.find(n => n.id === workspace.activeNovelId) || workspace.novels[0];
  const activeProfile = workspace.aiProfiles.find(p => p.id === workspace.activeProfileId) || workspace.aiProfiles[0];

  // --- UI State ---
  const [activeTab, setActiveTab] = useState<'chapters' | 'characters' | 'lores'>('chapters');
  const [activeChapterId, setActiveChapterId] = useState<string>(activeNovel.chapters[0]?.id || '');
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [activeLoreId, setActiveLoreId] = useState<string | null>(null);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'chat' | 'workflow' | 'brainstorm'>('chat');
  const [workflowState, setWorkflowState] = useState<{
    discussion: ChatMessage[];
    outline: string;
    draft: string;
    polished: string;
    step: number;
  }>({
    discussion: [],
    outline: '',
    draft: '',
    polished: '',
    step: 0
  });
  const [workflowChatInput, setWorkflowChatInput] = useState('');
  const [isWorkflowLoading, setIsWorkflowLoading] = useState(false);
  
  // Brainstorming state
  const [brainstormTopic, setBrainstormTopic] = useState('');
  const [brainstormHistory, setBrainstormHistory] = useState<BrainstormMessage[]>([]);
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [brainstormSummary, setBrainstormSummary] = useState('');
  const [brainstormRounds, setBrainstormRounds] = useState(3);
  const brainstormEndRef = useRef<HTMLDivElement>(null);

  const [isBuildingRAG, setIsBuildingRAG] = useState(false);
  const [ragProgress, setRagProgress] = useState({ current: 0, total: 0 });
  const [showSummary, setShowSummary] = useState(true);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [mobileActivePanel, setMobileActivePanel] = useState<'navigation' | 'editor' | 'ai'>('editor');
  const [viewMode, setViewMode] = useState<'auto' | 'mobile' | 'tablet' | 'desktop'>('auto');
  const [isExtractingCharacters, setIsExtractingCharacters] = useState(false);
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isExtractingLore, setIsExtractingLore] = useState(false);
  const [isGeneratingBatchSummaries, setIsGeneratingBatchSummaries] = useState(false);
  const [currentGeneratingChapterId, setCurrentGeneratingChapterId] = useState<string | null>(null);
  const [batchSummaryProgress, setBatchSummaryProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const metadataInputRef = useRef<HTMLInputElement>(null);

  const activeChapter = activeNovel.chapters.find(c => c.id === activeChapterId) || activeNovel.chapters[0];
  const activeCharacter = activeNovel.characters.find(c => c.id === activeCharacterId);
  const activeLore = activeNovel.lores?.find(l => l.id === activeLoreId);

  // Sync active chapter when switching novels
  useEffect(() => {
    if (!activeNovel.chapters.find(c => c.id === activeChapterId)) {
      setActiveChapterId(activeNovel.chapters[0]?.id || '');
    }
    if (!activeNovel.characters.find(c => c.id === activeCharacterId)) {
      setActiveCharacterId(null);
    }
    if (!activeNovel.lores?.find(l => l.id === activeLoreId)) {
      setActiveLoreId(null);
    }
    // Reset workflow state when chapter changes
    setWorkflowState({
      discussion: [],
      outline: '',
      draft: '',
      polished: '',
      step: 0
    });
  }, [workspace.activeNovelId, activeChapterId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // --- State Updaters ---
  const updateWorkspace = (updates: Partial<Workspace>) => {
    setWorkspace(prev => ({ ...prev, ...updates }));
  };

  const updateActiveNovel = (updates: Partial<Novel>) => {
    setWorkspace(prev => ({
      ...prev,
      novels: prev.novels.map(n => n.id === prev.activeNovelId ? { ...n, ...updates } : n)
    }));
  };

  const updateActiveChapter = (updates: Partial<Chapter>) => {
    updateActiveNovel({
      chapters: activeNovel.chapters.map(c => c.id === activeChapterId ? { ...c, ...updates } : c)
    });
  };

  const updateActiveCharacter = (updates: Partial<Character>) => {
    if (!activeCharacterId) return;
    updateActiveNovel({
      characters: activeNovel.characters.map(c => c.id === activeCharacterId ? { ...c, ...updates } : c)
    });
  };

  const updateActiveLore = (updates: Partial<Lore>) => {
    if (!activeLoreId || !activeNovel.lores) return;
    updateActiveNovel({
      lores: activeNovel.lores.map(l => l.id === activeLoreId ? { ...l, ...updates } : l)
    });
  };

  // --- Novel Management ---
  const createNovel = () => {
    const newNovel: Novel = {
      ...DEFAULT_NOVEL,
      id: `novel-${Date.now()}`,
      title: '新小说',
    };
    updateWorkspace({
      novels: [...workspace.novels, newNovel],
      activeNovelId: newNovel.id
    });
    setActiveTab('chapters');
  };

  const deleteNovel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (workspace.novels.length === 1) {
      setDialog({ isOpen: true, title: '提示', message: '至少需要保留一本小说！', type: 'alert' });
      return;
    }
    setDialog({
      isOpen: true,
      title: '删除小说',
      message: '确定要删除这本小说吗？所有数据将不可恢复！',
      type: 'confirm',
      onConfirm: () => {
        const newNovels = workspace.novels.filter(n => n.id !== id);
        updateWorkspace({
          novels: newNovels,
          activeNovelId: workspace.activeNovelId === id ? newNovels[0].id : workspace.activeNovelId
        });
        setDialog(null);
      }
    });
  };

  // --- Chapter Management ---
  const addChapter = () => {
    const newChapter: Chapter = {
      id: Date.now().toString(),
      title: `第${activeNovel.chapters.length + 1}章：新章节`,
      content: '',
      summary: '',
    };
    updateActiveNovel({ chapters: [...activeNovel.chapters, newChapter] });
    setActiveChapterId(newChapter.id);
    setActiveTab('chapters');
  };

  const deleteChapter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeNovel.chapters.length === 1) {
      setDialog({ isOpen: true, title: '提示', message: '至少需要保留一个章节！', type: 'alert' });
      return;
    }
    setDialog({
      isOpen: true,
      title: '删除章节',
      message: '确定要删除这个章节吗？',
      type: 'confirm',
      onConfirm: () => {
        const newChapters = activeNovel.chapters.filter(c => c.id !== id);
        updateActiveNovel({ chapters: newChapters });
        if (activeChapterId === id) {
          setActiveChapterId(newChapters[0].id);
        }
        setDialog(null);
      }
    });
  };

  // --- Character Management ---
  const handleExtractCharacters = async () => {
    if (!activeChapter || !activeChapter.content.trim()) {
      setDialog({ isOpen: true, title: '提示', message: '当前选中的章节内容为空，无法提取角色。请先在章节中输入内容。', type: 'alert' });
      return;
    }
    
    setIsExtractingCharacters(true);
    const contextText = activeChapter.summary 
      ? `【本章摘要】\n${activeChapter.summary}\n\n【本章正文】\n${activeChapter.content}` 
      : activeChapter.content;
    const extracted = await extractCharactersFromText(contextText, activeProfile);
    
    if (extracted && extracted.length > 0) {
      const newChars: Character[] = extracted.map(c => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        name: c.name || '未知角色',
        role: c.role || '配角',
        description: c.description || ''
      }));
      
      updateActiveNovel({ characters: [...activeNovel.characters, ...newChars] });
      setActiveCharacterId(newChars[0].id);
      setDialog({ isOpen: true, title: '提取成功', message: `成功从《${activeChapter.title}》中提取了 ${newChars.length} 个角色！`, type: 'alert' });
    } else {
      setDialog({ isOpen: true, title: '提取失败', message: '未能从当前章节文本中提取到角色信息，请确保文本中包含明显的人物描写。', type: 'alert' });
    }
    setIsExtractingCharacters(false);
  };

  const handleBatchExtractCharacters = async () => {
    setDialog({
      isOpen: true,
      title: '全书角色快速扫描',
      message: '将使用各章节的摘要（或开头片段）进行一次性角色提取，速度极快且节省 Token。确定要继续吗？',
      type: 'confirm',
      onConfirm: async () => {
        setDialog(null);
        setIsExtractingCharacters(true);
        
        // Use summaries or first 5000 chars to save tokens and speed up extraction
        const fullText = activeNovel.chapters
          .filter(c => c.content.trim().length > 0 || (c.summary && c.summary.trim().length > 0))
          .map(c => `【第${c.title}章】\n${c.summary ? `本章摘要：\n${c.summary}` : `本章正文片段：\n${c.content.substring(0, 5000)}`}`)
          .join('\n\n');

        if (!fullText) {
          setDialog({ isOpen: true, title: '提示', message: '小说内容为空，无法提取。', type: 'alert' });
          setIsExtractingCharacters(false);
          return;
        }

        try {
          const extracted = await extractCharactersFromText(fullText, activeProfile);
          const existingNames = new Set(activeNovel.characters.map(c => c.name));
          const newCharacters: Character[] = [];

          for (const char of extracted) {
            if (char.name && !existingNames.has(char.name)) {
              newCharacters.push({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                name: char.name,
                role: char.role || '配角',
                description: char.description || ''
              });
              existingNames.add(char.name);
            }
          }

          if (newCharacters.length > 0) {
            updateActiveNovel({ characters: [...activeNovel.characters, ...newCharacters] });
            setDialog({ isOpen: true, title: '扫描完成', message: `成功从全书中提取了 ${newCharacters.length} 个新角色！`, type: 'alert' });
          } else {
            setDialog({ isOpen: true, title: '扫描完成', message: '未发现新角色。', type: 'alert' });
          }
        } catch (e) {
          console.error("Batch extraction failed", e);
          setDialog({ isOpen: true, title: '扫描失败', message: '提取过程中发生错误。', type: 'alert' });
        }
        setIsExtractingCharacters(false);
      }
    });
  };

  const addCharacter = () => {
    const newChar: Character = {
      id: Date.now().toString(),
      name: '新角色',
      role: '配角',
      description: ''
    };
    updateActiveNovel({ characters: [...activeNovel.characters, newChar] });
    setActiveCharacterId(newChar.id);
    setActiveTab('characters');
  };

  const deleteCharacter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDialog({
      isOpen: true,
      title: '删除角色',
      message: '确定要删除这个角色吗？',
      type: 'confirm',
      onConfirm: () => {
        const newChars = activeNovel.characters.filter(c => c.id !== id);
        updateActiveNovel({ characters: newChars });
        if (activeCharacterId === id) {
          setActiveCharacterId(newChars.length > 0 ? newChars[0].id : null);
        }
        setDialog(null);
      }
    });
  };

  const addLore = () => {
    const newLore: Lore = {
      id: Date.now().toString(),
      name: '新设定',
      category: '其他',
      description: ''
    };
    updateActiveNovel({ lores: [...(activeNovel.lores || []), newLore] });
    setActiveLoreId(newLore.id);
    setActiveTab('lores');
  };

  const deleteLore = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDialog({
      isOpen: true,
      title: '删除设定',
      message: '确定要删除这个设定吗？',
      type: 'confirm',
      onConfirm: () => {
        const newLores = (activeNovel.lores || []).filter(l => l.id !== id);
        updateActiveNovel({ lores: newLores });
        if (activeLoreId === id) {
          setActiveLoreId(newLores.length > 0 ? newLores[0].id : null);
        }
        setDialog(null);
      }
    });
  };

  // --- AI Profile Management ---
  const addAIProfile = () => {
    const newProfile: AIProfile = {
      id: `profile-${Date.now()}`,
      name: '自定义 API',
      provider: 'custom',
      url: 'https://api.openai.com/v1/chat/completions',
      key: '',
      model: 'gpt-3.5-turbo',
      temperature: 0.7
    };
    updateWorkspace({
      aiProfiles: [...workspace.aiProfiles, newProfile],
      activeProfileId: newProfile.id
    });
  };

  const updateAIProfile = (id: string, updates: Partial<AIProfile>) => {
    updateWorkspace({
      aiProfiles: workspace.aiProfiles.map(p => p.id === id ? { ...p, ...updates } : p)
    });
  };

  const deleteAIProfile = (id: string) => {
    if (workspace.aiProfiles.length === 1) {
      setDialog({ isOpen: true, title: '提示', message: '至少需要保留一个 AI 配置！', type: 'alert' });
      return;
    }
    setDialog({
      isOpen: true,
      title: '删除配置',
      message: '确定删除此 AI 配置吗？',
      type: 'confirm',
      onConfirm: () => {
        const newProfiles = workspace.aiProfiles.filter(p => p.id !== id);
        updateWorkspace({
          aiProfiles: newProfiles,
          activeProfileId: workspace.activeProfileId === id ? newProfiles[0].id : workspace.activeProfileId
        });
        setDialog(null);
      }
    });
  };

  // --- Import / Export ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const regex = /(第[零一二三四五六七八九十百千万0-9]+[章回节].*)/g;
      const parts = text.split(regex);
      
      const newChapters: Chapter[] = [];
      
      if (parts[0].trim()) {
        newChapters.push({ id: Date.now().toString(), title: '序章/引言', content: parts[0].trim(), summary: '' });
      }
      
      for (let i = 1; i < parts.length; i += 2) {
        newChapters.push({
          id: (Date.now() + i).toString(),
          title: parts[i].trim(),
          content: (parts[i+1] || '').trim(),
          summary: ''
        });
      }

      const importedChapters = newChapters.length > 0 ? newChapters : [{ id: Date.now().toString(), title: '导入内容', content: text, summary: '' }];
      
      const newNovel: Novel = {
        ...DEFAULT_NOVEL,
        id: `novel-${Date.now()}`,
        title: file.name.replace('.txt', ''),
        chapters: importedChapters
      };

      updateWorkspace({
        novels: [...workspace.novels, newNovel],
        activeNovelId: newNovel.id
      });
      setActiveTab('chapters');
      setShowSettingsModal(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const text = activeNovel.chapters.map(c => `${c.title}\n\n${c.content}`).join('\n\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNovel.title || 'novel'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMetadata = () => {
    const metadata = {
      type: 'novel_metadata_backup',
      globalOutline: activeNovel.globalOutline,
      characters: activeNovel.characters,
      lores: activeNovel.lores,
      chapters: activeNovel.chapters.map(c => ({ title: c.title, summary: c.summary }))
    };
    const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeNovel.title || 'novel'}_设定与摘要.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMetadata = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const metadata = JSON.parse(event.target?.result as string);
        if (metadata.type !== 'novel_metadata_backup') {
          setDialog({ isOpen: true, title: '导入失败', message: '文件格式不正确，请选择有效的设定与摘要备份文件。', type: 'alert' });
          return;
        }

        // Merge logic
        const existingCharNames = new Set(activeNovel.characters.map(c => c.name));
        const mergedCharacters = [...activeNovel.characters];
        (metadata.characters || []).forEach((c: any) => {
          if (!existingCharNames.has(c.name)) {
            mergedCharacters.push({ ...c, id: Date.now().toString() + Math.random().toString(36).substring(7) });
          }
        });

        const existingLoreNames = new Set((activeNovel.lores || []).map(l => l.name));
        const mergedLores = [...(activeNovel.lores || [])];
        (metadata.lores || []).forEach((l: any) => {
          if (!existingLoreNames.has(l.name)) {
            mergedLores.push({ ...l, id: Date.now().toString() + Math.random().toString(36).substring(7) });
          }
        });

        const updatedChapters = [...activeNovel.chapters];
        (metadata.chapters || []).forEach((mc: any) => {
          if (mc.summary && mc.summary.trim()) {
            const chapterIndex = updatedChapters.findIndex(c => c.title === mc.title);
            if (chapterIndex !== -1) {
              // Overwrite summary if imported has one
              updatedChapters[chapterIndex] = { ...updatedChapters[chapterIndex], summary: mc.summary };
            }
          }
        });

        updateActiveNovel({
          globalOutline: metadata.globalOutline || activeNovel.globalOutline,
          characters: mergedCharacters,
          lores: mergedLores,
          chapters: updatedChapters
        });

        setDialog({ isOpen: true, title: '导入成功', message: '设定与摘要已成功合并到当前小说。', type: 'alert' });
      } catch (error) {
        setDialog({ isOpen: true, title: '导入失败', message: '解析文件时发生错误。', type: 'alert' });
      }
      if (metadataInputRef.current) metadataInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // --- AI Interactions ---
  const handleGenerateGlobalOutline = async () => {
    const summaries = activeNovel.chapters.map(c => c.summary).filter(s => s && s.trim().length > 0);
    if (summaries.length === 0) {
      setDialog({ isOpen: true, title: '提示', message: '目前没有任何章节摘要，请先生成章节摘要后再生成全书大纲。', type: 'alert' });
      return;
    }
    setIsGeneratingOutline(true);
    try {
      const outline = await generateGlobalOutline(summaries, activeProfile);
      updateActiveNovel({ globalOutline: outline });
    } catch (error: any) {
      setDialog({ isOpen: true, title: '生成失败', message: error.message, type: 'alert' });
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleExtractLore = async () => {
    if (!activeChapter || !activeChapter.content.trim()) {
      setDialog({ isOpen: true, title: '提示', message: '当前章节内容为空，无法提取设定。', type: 'alert' });
      return;
    }
    setIsExtractingLore(true);
    const contextText = activeChapter.summary 
      ? `【本章摘要】\n${activeChapter.summary}\n\n【本章正文】\n${activeChapter.content}` 
      : activeChapter.content;
    const extracted = await extractLoreFromText(contextText, activeProfile);
    
    if (extracted && extracted.length > 0) {
      const newLores: Lore[] = extracted.map(l => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        name: l.name || '未知设定',
        category: l.category || '其他',
        description: l.description || ''
      }));
      
      updateActiveNovel({ lores: [...(activeNovel.lores || []), ...newLores] });
      setActiveLoreId(newLores[0].id);
      setActiveTab('lores');
      setDialog({ isOpen: true, title: '提取成功', message: `成功从《${activeChapter.title}》中提取了 ${newLores.length} 个设定！`, type: 'alert' });
    } else {
      setDialog({ isOpen: true, title: '提示', message: '本章未发现明显的新设定。', type: 'alert' });
    }
    setIsExtractingLore(false);
  };

  const handleBatchExtractLore = async () => {
    setDialog({
      isOpen: true,
      title: '全书设定快速扫描',
      message: '将使用各章节的摘要（或开头片段）进行一次性世界观设定提取，速度极快且节省 Token。确定要继续吗？',
      type: 'confirm',
      onConfirm: async () => {
        setDialog(null);
        setIsExtractingLore(true);
        
        const fullText = activeNovel.chapters
          .filter(c => c.content.trim().length > 0 || (c.summary && c.summary.trim().length > 0))
          .map(c => `【第${c.title}章】\n${c.summary ? `本章摘要：\n${c.summary}` : `本章正文片段：\n${c.content.substring(0, 5000)}`}`)
          .join('\n\n');

        if (!fullText) {
          setDialog({ isOpen: true, title: '提示', message: '小说内容为空，无法提取。', type: 'alert' });
          setIsExtractingLore(false);
          return;
        }

        try {
          const extracted = await extractLoreFromText(fullText, activeProfile);
          const existingNames = new Set((activeNovel.lores || []).map(l => l.name));
          const newLores: Lore[] = [];

          for (const lore of extracted) {
            if (lore.name && !existingNames.has(lore.name)) {
              newLores.push({
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                name: lore.name,
                category: lore.category || '其他',
                description: lore.description || ''
              });
              existingNames.add(lore.name);
            }
          }

          if (newLores.length > 0) {
            updateActiveNovel({ lores: [...(activeNovel.lores || []), ...newLores] });
            setActiveLoreId(newLores[0].id);
            setActiveTab('lores');
            setDialog({ isOpen: true, title: '提取成功', message: `全书扫描完成，共提取并新增了 ${newLores.length} 个设定！`, type: 'alert' });
          } else {
            setDialog({ isOpen: true, title: '提示', message: '未发现明显的新设定，或提取的设定已存在。', type: 'alert' });
          }
        } catch (error) {
          console.error("Failed to batch extract lore", error);
          setDialog({ isOpen: true, title: '提取失败', message: '扫描全书设定时发生错误。', type: 'alert' });
        }
        setIsExtractingLore(false);
      }
    });
  };

  const handleGenerateSummary = async () => {
    if (!activeChapter?.content.trim()) {
      setDialog({ isOpen: true, title: '提示', message: '章节内容为空，无法生成摘要！', type: 'alert' });
      return;
    }
    setIsGeneratingSummary(true);
    try {
      const summary = await generateChapterSummary(activeChapter.content, activeProfile);
      updateActiveChapter({ summary });
      setShowSummary(true);
    } catch (error: any) {
      setDialog({ isOpen: true, title: '生成失败', message: error.message, type: 'alert' });
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleBatchGenerateSummaries = async () => {
    const chaptersWithoutSummary = activeNovel.chapters.filter(c => !c.summary && c.content.trim().length > 0);
    
    if (chaptersWithoutSummary.length === 0) {
      setDialog({ isOpen: true, title: '提示', message: '所有包含内容的章节都已经有摘要了！', type: 'alert' });
      return;
    }

    setDialog({
      isOpen: true,
      title: '批量生成摘要',
      message: `将为 ${chaptersWithoutSummary.length} 个尚未生成摘要的章节自动生成摘要。这可能需要一些时间，确定要继续吗？`,
      type: 'confirm',
      onConfirm: async () => {
        setDialog(null);
        setIsGeneratingBatchSummaries(true);

        let currentChapters = [...activeNovel.chapters];
        let generatedCount = 0;
        const totalToGenerate = chaptersWithoutSummary.length;

        for (let i = 0; i < currentChapters.length; i++) {
          const chapter = currentChapters[i];
          if (!chapter.summary && chapter.content.trim()) {
            setCurrentGeneratingChapterId(chapter.id);
            setBatchSummaryProgress({ current: generatedCount + 1, total: totalToGenerate, title: chapter.title });
            
            try {
              const summary = await generateChapterSummary(chapter.content, activeProfile);
              
              // Update local copy
              currentChapters[i] = { ...chapter, summary };
              generatedCount++;
              
              // Update state incrementally
              updateActiveNovel({ chapters: [...currentChapters] });
              
              // Small delay to prevent UI freezing and rate limits
              if (generatedCount < totalToGenerate) {
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            } catch (e: any) {
              console.error(`Failed to generate summary for chapter ${chapter.title}`, e);
              setDialog({
                isOpen: true,
                title: '批量生成中断',
                message: `在处理章节《${chapter.title}》时发生错误：\n${e.message}\n\n已成功生成 ${generatedCount} 个章节的摘要。请稍后再试。`,
                type: 'alert'
              });
              setCurrentGeneratingChapterId(null);
              setBatchSummaryProgress(null);
              setIsGeneratingBatchSummaries(false);
              return;
            }
          }
        }

        setCurrentGeneratingChapterId(null);
        setBatchSummaryProgress(null);
        setDialog({
          isOpen: true,
          title: '批量生成完成',
          message: `成功为 ${generatedCount} 个章节生成了摘要！现在你可以更精准地提取全书角色和生成大纲了。`,
          type: 'alert'
        });
        setIsGeneratingBatchSummaries(false);
      }
    });
  };

  // --- Multi-Agent Workflow ---
  const handleWorkflowDiscussion = async () => {
    if (!workflowChatInput.trim() || isWorkflowLoading || !activeChapter) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: workflowChatInput };
    setWorkflowState(prev => ({ ...prev, discussion: [...prev.discussion, userMsg] }));
    setWorkflowChatInput('');
    setIsWorkflowLoading(true);

    try {
      const previousSummaries = activeNovel.chapters
        .filter(c => c.id !== activeChapter.id)
        .map(c => c.summary)
        .filter(s => s)
        .join('\n');

      const aiResponse = await chatWithAI(
        userMsg.text,
        activeNovel.globalStyle,
        activeNovel.styleExamples,
        activeNovel.negativePrompts,
        activeNovel.lores || [],
        activeNovel.globalOutline || '',
        activeChapter.content || '',
        previousSummaries,
        activeNovel.characters,
        workflowState.discussion,
        activeProfile
      );

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: aiResponse };
      setWorkflowState(prev => ({ ...prev, discussion: [...prev.discussion, aiMsg] }));
    } catch (error) {
      console.error("Workflow discussion error:", error);
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const handleGenerateWorkflowOutline = async () => {
    if (!activeChapter) return;
    setIsWorkflowLoading(true);
    try {
      const previousSummaries = activeNovel.chapters
        .filter(c => c.id !== activeChapter.id)
        .map(c => c.summary)
        .filter(s => s)
        .join('\n');
      
      const outline = await generateChapterOutline(
        activeChapter.title,
        previousSummaries,
        activeNovel.globalOutline || '',
        activeNovel.characters,
        activeNovel.lores || [],
        activeProfile,
        workflowState.discussion
      );
      setWorkflowState(prev => ({ ...prev, outline, step: 1 }));
    } catch (error) {
      setDialog({ isOpen: true, title: '生成失败', message: '大纲生成失败，请检查网络或API配置。', type: 'alert' });
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const handleGenerateWorkflowDraft = async () => {
    if (!workflowState.outline) return;
    setIsWorkflowLoading(true);
    try {
      const draft = await generateChapterDraft(
        workflowState.outline,
        activeNovel.globalStyle || '',
        activeNovel.styleExamples || '',
        activeNovel.characters,
        activeNovel.lores || [],
        activeProfile
      );
      setWorkflowState(prev => ({ ...prev, draft, step: 2 }));
    } catch (error) {
      setDialog({ isOpen: true, title: '生成失败', message: '正文扩写失败，请检查网络或API配置。', type: 'alert' });
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const handlePolishWorkflowDraft = async () => {
    if (!workflowState.draft) return;
    setIsWorkflowLoading(true);
    try {
      const polished = await polishChapterDraft(
        workflowState.draft,
        activeNovel.globalStyle || '',
        activeNovel.styleExamples || '',
        activeNovel.negativePrompts || '',
        activeProfile
      );
      setWorkflowState(prev => ({ ...prev, polished, step: 3 }));
    } catch (error) {
      setDialog({ isOpen: true, title: '生成失败', message: '润色失败，请检查网络或API配置。', type: 'alert' });
    } finally {
      setIsWorkflowLoading(false);
    }
  };

  const handleApplyWorkflowToChapter = () => {
    if (!activeChapter) return;
    const finalContent = workflowState.step === 3 ? workflowState.polished : workflowState.draft;
    updateActiveChapter({ content: finalContent });
    setDialog({ isOpen: true, title: '应用成功', message: '已将生成的内容应用到当前章节。', type: 'alert' });
  };

  const handleBuildRAG = async () => {
    setIsBuildingRAG(true);
    setRagProgress({ current: 0, total: activeNovel.chapters.length });
    try {
      await clearNovelChunks(activeNovel.id);
      for (let i = 0; i < activeNovel.chapters.length; i++) {
        const chapter = activeNovel.chapters[i];
        if (chapter.content && chapter.content.trim().length > 0) {
          await addNovelChunks(activeNovel.id, chapter.id, chapter.content);
        }
        setRagProgress({ current: i + 1, total: activeNovel.chapters.length });
      }
      setDialog({ isOpen: true, title: '构建成功', message: '本地向量知识库 (RAG) 构建完成！AI 助手现在可以检索全书内容了。', type: 'alert' });
    } catch (error) {
      console.error("Error building RAG:", error);
      setDialog({ isOpen: true, title: '构建失败', message: '构建向量知识库时发生错误。', type: 'alert' });
    } finally {
      setIsBuildingRAG(false);
    }
  };

  const handleStartBrainstorm = async () => {
    if (!brainstormTopic.trim() || isBrainstorming) return;
    
    setIsBrainstorming(true);
    setBrainstormHistory([]);
    setBrainstormSummary('');
    
    const agents = [
      { name: 'Agent 1', role: '逻辑严密的架构师，负责梳理主线和因果关系' },
      { name: 'Agent 2', role: '天马行空的创意大师，负责提供意想不到的转折和脑洞' },
      { name: 'Agent 3', role: '注重情感的细节控，负责挖掘角色内心和情感冲突' }
    ];

    let currentHistory: { agentName: string; text: string }[] = [];
    
    try {
      for (let round = 0; round < brainstormRounds; round++) {
        for (const agent of agents) {
          const response = await brainstormOutline(
            brainstormTopic,
            currentHistory,
            agent.role,
            activeNovel.globalOutline || '',
            activeNovel.characters,
            activeNovel.lores || [],
            activeProfile
          );
          
          const newMessage: BrainstormMessage = {
            id: Date.now().toString() + Math.random(),
            agentName: agent.name,
            agentRole: agent.role,
            text: response
          };
          
          currentHistory = [...currentHistory, { agentName: agent.name, text: response }];
          setBrainstormHistory(prev => [...prev, newMessage]);
          
          // Small delay for UI update
          await new Promise(resolve => setTimeout(resolve, 500));
          brainstormEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      // Generate summary
      const summary = await summarizeBrainstorming(brainstormTopic, currentHistory, activeProfile);
      setBrainstormSummary(summary);
      
    } catch (error) {
      setDialog({ isOpen: true, title: '推演失败', message: '大纲推演过程中发生错误，请检查网络或API配置。', type: 'alert' });
    } finally {
      setIsBrainstorming(false);
      brainstormEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatting) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput };
    setChatHistory(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);

    try {
      // Retrieve relevant context from RAG if available
      let ragContext = '';
      try {
        const relevantChunks = await searchRelevantContext(activeNovel.id, userMsg.text, 3);
        if (relevantChunks.length > 0) {
          ragContext = `\n\n【相关原文片段检索】\n${relevantChunks.join('\n...\n')}`;
        }
      } catch (e) {
        console.warn("RAG search failed or not built yet:", e);
      }

      const previousSummaries = activeNovel.chapters
        .filter(c => c && activeChapter && c.id !== activeChapter.id)
        .map(c => c.summary)
        .filter(s => s)
        .join('\n');

      const aiResponse = await chatWithAI(
        userMsg.text,
        activeNovel.globalStyle,
        activeNovel.styleExamples,
        activeNovel.negativePrompts,
        activeNovel.lores || [],
        activeNovel.globalOutline || '',
        (activeChapter?.content || '') + ragContext,
        previousSummaries,
        activeNovel.characters,
        chatHistory,
        activeProfile
      );

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: aiResponse };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#f5f5f0] text-stone-900 font-sans overflow-hidden">
      
      {/* Main Content Area */}
      <div className={`flex-1 flex overflow-hidden ${
        viewMode === 'desktop' ? 'flex-row' : 
        viewMode === 'mobile' ? 'flex-col' : 
        viewMode === 'tablet' ? 'flex-row' : 'md:flex-row flex-col'
      }`}>
        
        {/* Left Sidebar: Navigation */}
        <div className={`
          ${viewMode === 'desktop' ? 'flex w-64' : 
            viewMode === 'mobile' ? (mobileActivePanel === 'navigation' ? 'flex w-full' : 'hidden') : 
            viewMode === 'tablet' ? (mobileActivePanel === 'navigation' ? 'flex w-64' : 'hidden md:flex md:w-64') : 
            (mobileActivePanel === 'navigation' ? 'flex w-full md:w-64' : 'hidden md:flex md:w-64')} 
          bg-stone-100 border-r border-stone-200 flex-col h-full
        `}>
        {/* Top Bar: Novel Selector */}
        <div className="p-3 border-b border-stone-200 bg-stone-200/50">
          <div className="flex items-center gap-2 text-stone-600 mb-1 px-1">
            <Library size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">我的书架</span>
          </div>
          <select
            value={workspace.activeNovelId}
            onChange={(e) => updateWorkspace({ activeNovelId: e.target.value })}
            className="w-full p-1.5 bg-white border border-stone-300 rounded text-sm font-medium outline-none focus:ring-1 focus:ring-stone-400"
          >
            {workspace.novels.map(n => (
              <option key={n.id} value={n.id}>{n.title}</option>
            ))}
          </select>
        </div>

        {/* Header */}
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <input
            type="text"
            value={activeNovel.title}
            onChange={(e) => updateActiveNovel({ title: e.target.value })}
            className="w-full bg-transparent text-xl font-bold border-none outline-none focus:ring-2 focus:ring-stone-300 rounded px-1 py-1 truncate"
            placeholder="小说标题"
          />
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 text-stone-500 hover:bg-stone-200 rounded-md transition-colors"
            title="全局设置与导入导出"
          >
            <Settings size={18} />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setActiveTab('chapters')}
            className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'chapters' ? 'bg-stone-200 text-stone-900' : 'text-stone-500 hover:bg-stone-200/50'
            }`}
          >
            <Book size={16} /> 大纲
          </button>
          <button
            onClick={() => {
              setActiveTab('characters');
              if (!activeCharacterId && activeNovel.characters.length > 0) {
                setActiveCharacterId(activeNovel.characters[0].id);
              }
            }}
            className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'characters' ? 'bg-stone-200 text-stone-900' : 'text-stone-500 hover:bg-stone-200/50'
            }`}
          >
            <Users size={16} /> 角色
          </button>
          <button
            onClick={() => {
              setActiveTab('lores');
              if (!activeLoreId && activeNovel.lores && activeNovel.lores.length > 0) {
                setActiveLoreId(activeNovel.lores[0].id);
              }
            }}
            className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              activeTab === 'lores' ? 'bg-stone-200 text-stone-900' : 'text-stone-500 hover:bg-stone-200/50'
            }`}
          >
            <Library size={16} /> 设定
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeTab === 'chapters' ? (
            activeNovel.chapters.map(chapter => (
              <div
                key={chapter.id}
                onClick={() => setActiveChapterId(chapter.id)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                  activeChapterId === chapter.id ? 'bg-stone-200 text-stone-900 font-medium' : 'hover:bg-stone-200/50 text-stone-600'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {currentGeneratingChapterId === chapter.id || (isGeneratingSummary && activeChapterId === chapter.id) ? (
                    <Loader2 size={16} className="text-emerald-500 animate-spin shrink-0" />
                  ) : (
                    <FileText size={16} className={activeChapterId === chapter.id ? 'text-stone-700 shrink-0' : 'text-stone-400 shrink-0'} />
                  )}
                  <span className="truncate text-sm">{chapter.title}</span>
                </div>
                <button
                  onClick={(e) => deleteChapter(chapter.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-300 rounded text-stone-500 transition-opacity"
                  title="删除章节"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : activeTab === 'characters' ? (
            activeNovel.characters.map(char => (
              <div
                key={char.id}
                onClick={() => setActiveCharacterId(char.id)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                  activeCharacterId === char.id ? 'bg-stone-200 text-stone-900 font-medium' : 'hover:bg-stone-200/50 text-stone-600'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <User size={16} className={activeCharacterId === char.id ? 'text-stone-700' : 'text-stone-400'} />
                  <span className="truncate text-sm">{char.name || '未命名'}</span>
                </div>
                <button
                  onClick={(e) => deleteCharacter(char.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-300 rounded text-stone-500 transition-opacity"
                  title="删除角色"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          ) : (
            (activeNovel.lores || []).map(lore => (
              <div
                key={lore.id}
                onClick={() => setActiveLoreId(lore.id)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                  activeLoreId === lore.id ? 'bg-stone-200 text-stone-900 font-medium' : 'hover:bg-stone-200/50 text-stone-600'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Library size={16} className={activeLoreId === lore.id ? 'text-stone-700' : 'text-stone-400'} />
                  <span className="truncate text-sm">{lore.name || '未命名'}</span>
                </div>
                <button
                  onClick={(e) => deleteLore(lore.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-stone-300 rounded text-stone-500 transition-opacity"
                  title="删除设定"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
        
        {/* Add Button */}
        <div className="p-4 border-t border-stone-200 space-y-2">
          {activeTab === 'chapters' && (
            <div className="space-y-2">
              <button
                onClick={handleBatchGenerateSummaries}
                disabled={isGeneratingBatchSummaries}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                {isGeneratingBatchSummaries ? <Loader2 size={16} className="animate-spin" /> : <Library size={16} />}
                {isGeneratingBatchSummaries ? '正在批量生成...' : '一键生成缺失摘要'}
              </button>
              {batchSummaryProgress && (
                <div className="space-y-1.5 px-1">
                  <div className="flex justify-between text-xs text-stone-500 font-medium">
                    <span className="truncate pr-2">正在生成: {batchSummaryProgress.title}</span>
                    <span className="shrink-0">{batchSummaryProgress.current} / {batchSummaryProgress.total}</span>
                  </div>
                  <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-300 ease-out" 
                      style={{ width: `${(batchSummaryProgress.current / batchSummaryProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'characters' && (
            <>
              <button
                onClick={handleExtractCharacters}
                disabled={isExtractingCharacters}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Wand2 size={16} />
                {isExtractingCharacters ? '正在提取...' : '从当前章节提取角色'}
              </button>
              <button
                onClick={handleBatchExtractCharacters}
                disabled={isExtractingCharacters}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Library size={16} />
                {isExtractingCharacters ? '正在扫描...' : '一键扫描全书角色'}
              </button>
            </>
          )}
          {activeTab === 'lores' && (
            <>
              <button
                onClick={handleExtractLore}
                disabled={isExtractingLore}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Sparkles size={16} />
                {isExtractingLore ? '正在提取...' : '从当前章节提取设定'}
              </button>
              <button
                onClick={handleBatchExtractLore}
                disabled={isExtractingLore}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-md transition-colors text-sm font-medium disabled:opacity-50"
              >
                <Library size={16} />
                {isExtractingLore ? '正在扫描...' : '一键扫描全书设定'}
              </button>
            </>
          )}
          <button
            onClick={activeTab === 'chapters' ? addChapter : activeTab === 'characters' ? addCharacter : addLore}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-stone-800 hover:bg-stone-700 text-stone-50 rounded-md transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            {activeTab === 'chapters' ? '新建章节' : activeTab === 'characters' ? '新建角色' : '新建设定'}
          </button>
        </div>
      </div>

      {/* Center: Editor Area */}
      <div className={`
        ${viewMode === 'desktop' ? 'flex flex-1' : 
          viewMode === 'mobile' ? (mobileActivePanel === 'editor' ? 'flex w-full' : 'hidden') : 
          viewMode === 'tablet' ? 'flex flex-1' : 
          (mobileActivePanel === 'editor' ? 'flex w-full md:flex-1' : 'hidden md:flex md:flex-1')} 
        flex-col bg-white relative h-full
      `}>
        {activeTab === 'chapters' ? (
          activeChapter ? (
            <>
              {/* Chapter Editor */}
              <div className="p-4 md:p-6 pb-2 border-b border-stone-100 flex-shrink-0">
                <input
                  type="text"
                  value={activeChapter.title}
                  onChange={(e) => updateActiveChapter({ title: e.target.value })}
                  className="w-full text-2xl md:text-3xl font-serif font-bold text-stone-800 border-none outline-none placeholder-stone-300"
                  placeholder="输入章节标题..."
                />
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 pt-4">
                <textarea
                  value={activeChapter.content}
                  onChange={(e) => updateActiveChapter({ content: e.target.value })}
                  className="w-full flex-1 resize-none border-none outline-none text-base md:text-lg leading-relaxed font-serif text-stone-700 placeholder-stone-300"
                  placeholder="在这里开始你的创作..."
                />
              </div>

              {/* Summary Panel */}
              <div className="border-t border-stone-200 bg-stone-50 flex-shrink-0">
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-stone-100 transition-colors"
                  onClick={() => setShowSummary(!showSummary)}
                >
                  <div className="flex items-center gap-2 text-stone-600 font-medium text-sm">
                    <Sparkles size={16} className="text-amber-500" />
                    <span>本章摘要与核心事件</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateSummary();
                      }}
                      disabled={isGeneratingSummary}
                      className="text-xs bg-stone-200 hover:bg-stone-300 text-stone-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1"
                    >
                      {isGeneratingSummary ? (
                        <span className="animate-pulse">生成中...</span>
                      ) : (
                        <>
                          <Sparkles size={12} /> AI 一键摘要
                        </>
                      )}
                    </button>
                    {showSummary ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
                  </div>
                </div>
                
                {showSummary && (
                  <div className="p-4 pt-0">
                    <textarea
                      value={activeChapter.summary}
                      onChange={(e) => updateActiveChapter({ summary: e.target.value })}
                      className="w-full h-24 p-3 text-sm bg-white border border-stone-200 rounded-md resize-none outline-none focus:ring-1 focus:ring-stone-300 text-stone-600"
                      placeholder="点击上方按钮让 AI 自动生成，或手动输入本章摘要..."
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400">
              请在左侧新建一个章节
            </div>
          )
        ) : activeTab === 'characters' ? (
          /* Character Editor */
          activeCharacter ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto w-full">
              <div className="mb-6 md:mb-8">
                <h2 className="text-xl md:text-2xl font-bold text-stone-800 mb-2">角色设定卡</h2>
                <p className="text-stone-500 text-xs md:text-sm">在这里完善角色的详细设定，AI 在创作时会参考这些信息。</p>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">角色姓名</label>
                  <input
                    type="text"
                    value={activeCharacter.name}
                    onChange={(e) => updateActiveCharacter({ name: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-stone-300 text-stone-800 font-medium"
                    placeholder="例如：李明"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">身份/定位</label>
                  <input
                    type="text"
                    value={activeCharacter.role}
                    onChange={(e) => updateActiveCharacter({ role: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-stone-300 text-stone-800"
                    placeholder="例如：主角、反派、导师..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">详细设定 (外貌、性格、背景、特殊能力等)</label>
                  <textarea
                    value={activeCharacter.description}
                    onChange={(e) => updateActiveCharacter({ description: e.target.value })}
                    className="w-full h-64 p-3 bg-stone-50 border border-stone-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-stone-300 text-stone-800 leading-relaxed"
                    placeholder="详细描述这个角色的特点..."
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400">
              请在左侧选择或新建一个角色
            </div>
          )
        ) : (
          /* Lore Editor */
          activeLore ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto w-full">
              <div className="mb-6 md:mb-8">
                <h2 className="text-xl md:text-2xl font-bold text-stone-800 mb-2">世界观设定卡</h2>
                <p className="text-stone-500 text-xs md:text-sm">在这里完善世界观设定的详细信息，AI 在创作时会参考这些信息。</p>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">设定名称</label>
                  <input
                    type="text"
                    value={activeLore.name}
                    onChange={(e) => updateActiveLore({ name: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-stone-300 text-stone-800 font-medium"
                    placeholder="例如：青云门、九阳神功、灵石..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">类别</label>
                  <input
                    type="text"
                    value={activeLore.category}
                    onChange={(e) => updateActiveLore({ category: e.target.value })}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-lg outline-none focus:ring-2 focus:ring-stone-300 text-stone-800"
                    placeholder="例如：地点、势力、功法、法宝、境界..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">详细描述</label>
                  <textarea
                    value={activeLore.description}
                    onChange={(e) => updateActiveLore({ description: e.target.value })}
                    className="w-full h-64 p-3 bg-stone-50 border border-stone-200 rounded-lg resize-none outline-none focus:ring-2 focus:ring-stone-300 text-stone-800 leading-relaxed"
                    placeholder="详细描述这个设定的特点、作用、历史等..."
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-stone-400">
              请在左侧选择或新建设定
            </div>
          )
        )}
      </div>

      {/* Right Sidebar: AI Assistant & Settings */}
      <div className={`
        ${viewMode === 'desktop' ? 'flex w-96' : 
          viewMode === 'mobile' ? (mobileActivePanel === 'ai' ? 'flex w-full' : 'hidden') : 
          viewMode === 'tablet' ? (mobileActivePanel === 'ai' ? 'flex w-96' : 'hidden lg:flex lg:w-96') : 
          (mobileActivePanel === 'ai' ? 'flex w-full lg:w-96' : 'hidden lg:flex lg:w-96')} 
        bg-stone-50 border-l border-stone-200 flex-col h-full
      `}>
        {/* AI Profile Selector */}
        <div className="p-3 border-b border-stone-200 bg-stone-200/50">
          <div className="flex items-center gap-2 text-stone-600 mb-1 px-1">
            <Cpu size={14} />
            <span className="text-xs font-bold uppercase tracking-wider">当前使用 AI</span>
          </div>
          <select
            value={workspace.activeProfileId}
            onChange={(e) => updateWorkspace({ activeProfileId: e.target.value })}
            className="w-full p-1.5 bg-white border border-stone-300 rounded text-sm font-medium outline-none focus:ring-1 focus:ring-stone-400"
          >
            {workspace.aiProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Global Style Settings */}
        <div className="p-4 border-b border-stone-200 flex-shrink-0 overflow-y-auto max-h-[40vh]">
          <div className="flex items-center gap-2 text-stone-500 mb-3">
            <Sliders size={18} />
            <span className="text-sm font-medium uppercase tracking-wider">全局设定与文风</span>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">核心设定与方向</label>
              <textarea
                value={activeNovel.globalStyle}
                onChange={(e) => updateActiveNovel({ globalStyle: e.target.value })}
                className="w-full h-20 p-2 text-sm bg-white border border-stone-200 rounded-md resize-none outline-none focus:ring-1 focus:ring-stone-300 text-stone-600"
                placeholder="输入小说的世界观、核心设定或期望的文风（如：克苏鲁风、轻松搞笑、赛博朋克...）"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-stone-600">世界设定集 (Lorebook)</label>
                <div className="flex gap-1">
                  <button
                    onClick={handleExtractLore}
                    disabled={isExtractingLore}
                    className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="从当前章节提取设定"
                  >
                    {isExtractingLore ? '提取中...' : <><Sparkles size={12} /> 本章提取</>}
                  </button>
                  <button
                    onClick={handleBatchExtractLore}
                    disabled={isExtractingLore}
                    className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="扫描全书摘要提取设定"
                  >
                    {isExtractingLore ? '扫描中...' : <><Library size={12} /> 全书扫描</>}
                  </button>
                </div>
              </div>
              <textarea
                value={activeNovel.lorebook || ''}
                onChange={(e) => updateActiveNovel({ lorebook: e.target.value })}
                className="w-full h-20 p-2 text-sm bg-white border border-stone-200 rounded-md resize-none outline-none focus:ring-1 focus:ring-stone-300 text-stone-600"
                placeholder="【法宝】xxx：功能是...\n【境界】炼气、筑基、金丹..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-stone-600">全书大纲/剧情脉络</label>
                <button
                  onClick={handleGenerateGlobalOutline}
                  disabled={isGeneratingOutline}
                  className="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {isGeneratingOutline ? '生成中...' : <><Sparkles size={12} /> 基于章节摘要生成</>}
                </button>
              </div>
              <textarea
                value={activeNovel.globalOutline || ''}
                onChange={(e) => updateActiveNovel({ globalOutline: e.target.value })}
                className="w-full h-32 p-2 text-sm bg-stone-50 border border-stone-200 rounded-md resize-none outline-none focus:ring-1 focus:ring-stone-300 text-stone-600"
                placeholder="全书大纲，可点击上方按钮由AI根据各章节摘要自动生成..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1">文笔参考范例 (Few-Shot)</label>
              <textarea
                value={activeNovel.styleExamples}
                onChange={(e) => updateActiveNovel({ styleExamples: e.target.value })}
                className="w-full h-20 p-2 text-sm bg-white border border-stone-200 rounded-md resize-none outline-none focus:ring-1 focus:ring-stone-300 text-stone-600"
                placeholder="粘贴几段你满意的原文，AI 续写时会模仿这种句式和用词习惯..."
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-600 mb-1 text-red-800/70">负面提示词 (禁止项)</label>
              <textarea
                value={activeNovel.negativePrompts || ''}
                onChange={(e) => updateActiveNovel({ negativePrompts: e.target.value })}
                className="w-full h-16 p-2 text-sm bg-red-50/50 border border-red-100 rounded-md resize-none outline-none focus:ring-1 focus:ring-red-200 text-stone-600"
                placeholder="禁止使用现代网络用语、禁止过于华丽空洞的辞藻..."
              />
            </div>
          </div>
        </div>

        {/* AI Chat Interface */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-stone-200 bg-white flex-shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-800">
              <Sparkles size={18} className="text-stone-500" />
              <span className="text-sm font-medium uppercase tracking-wider">AI 创作助手</span>
            </div>
            <div className="flex bg-stone-100 p-1 rounded-lg">
              <button
                onClick={() => setRightPanelTab('chat')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  rightPanelTab === 'chat' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                自由对话
              </button>
              <button
                onClick={() => setRightPanelTab('workflow')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  rightPanelTab === 'workflow' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                多Agent工作流
              </button>
              <button
                onClick={() => setRightPanelTab('brainstorm')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  rightPanelTab === 'brainstorm' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                大纲推演
              </button>
            </div>
          </div>
          
          {rightPanelTab === 'chat' ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.length === 0 && (
                  <div className="text-center text-stone-400 text-sm mt-10">
                    <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
                    <p>你好！我是你的 AI 创作助手。</p>
                    <p className="mt-1">你可以让我帮你构思剧情、润色文字，或者提供灵感。</p>
                  </div>
                )}
                {chatHistory.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div 
                      className={`max-w-[85%] p-3 rounded-lg text-sm whitespace-pre-wrap ${
                        msg.role === 'user' 
                          ? 'bg-stone-800 text-stone-50 rounded-tr-none' 
                          : 'bg-white border border-stone-200 text-stone-700 rounded-tl-none shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] p-3 rounded-lg bg-white border border-stone-200 text-stone-500 rounded-tl-none shadow-sm text-sm flex items-center gap-2">
                      <span className="animate-pulse">AI 正在思考...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 border-t border-stone-200 bg-white flex-shrink-0">
                <div className="relative">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="输入你的想法或指令 (Shift+Enter 换行)..."
                    className="w-full pl-3 pr-10 py-3 bg-stone-50 border border-stone-200 rounded-lg resize-none outline-none focus:ring-1 focus:ring-stone-300 text-sm text-stone-700 max-h-32 min-h-[44px]"
                    rows={2}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isChatting}
                    className="absolute right-2 bottom-2 p-1.5 bg-stone-800 text-stone-50 rounded-md hover:bg-stone-700 disabled:opacity-50 transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : rightPanelTab === 'workflow' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <div className="text-sm text-stone-500 mb-4">
                多 Agent 协作流：将创作拆分为讨论、大纲、草稿、精修四个阶段，由不同的 AI 角色分别完成，提高长文质量。
              </div>

              {/* Step 0: Discussion */}
              <div className={`border rounded-lg p-4 ${workflowState.step >= 0 ? 'border-stone-300 bg-white' : 'border-stone-200 bg-stone-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-800 text-white flex items-center justify-center text-xs font-bold">0</div>
                    <h3 className="font-medium text-stone-800">剧情构思讨论</h3>
                  </div>
                </div>
                
                <div className="space-y-3 mb-3 max-h-60 overflow-y-auto border-b border-stone-100 pb-3">
                  {workflowState.discussion.length === 0 && (
                    <p className="text-xs text-stone-400 text-center py-2">在生成大纲前，先和 AI 聊聊本章的想法吧。</p>
                  )}
                  {workflowState.discussion.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] p-2 rounded text-xs ${msg.role === 'user' ? 'bg-stone-100 text-stone-700' : 'bg-stone-50 text-stone-600 border border-stone-100'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isWorkflowLoading && workflowState.step === 0 && (
                    <div className="flex justify-start">
                      <div className="p-2 rounded text-xs bg-stone-50 text-stone-400 animate-pulse">AI 正在回应...</div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    value={workflowChatInput}
                    onChange={(e) => setWorkflowChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleWorkflowDiscussion();
                      }
                    }}
                    placeholder="输入想法与 AI 讨论剧情..."
                    className="w-full p-2 text-xs border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none min-h-[60px]"
                  />
                  <button
                    onClick={handleWorkflowDiscussion}
                    disabled={!workflowChatInput.trim() || isWorkflowLoading}
                    className="absolute right-2 bottom-2 p-1 bg-stone-800 text-white rounded hover:bg-stone-700 disabled:opacity-50"
                  >
                    <Send size={12} />
                  </button>
                </div>
              </div>
              
              {/* Step 1: Outline */}
              <div className={`border rounded-lg p-4 ${workflowState.step >= 1 ? 'border-stone-300 bg-white' : 'border-stone-200 bg-stone-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-800 text-white flex items-center justify-center text-xs font-bold">1</div>
                    <h3 className="font-medium text-stone-800">Agent 1: 剧情大纲策划</h3>
                  </div>
                  <button 
                    onClick={handleGenerateWorkflowOutline}
                    disabled={isWorkflowLoading || !activeChapter}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isWorkflowLoading && workflowState.step === 1 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    生成大纲
                  </button>
                </div>
                {workflowState.outline && (
                  <textarea
                    value={workflowState.outline}
                    onChange={(e) => setWorkflowState(prev => ({ ...prev, outline: e.target.value }))}
                    className="w-full h-32 p-3 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none"
                    placeholder="在此编辑大纲..."
                  />
                )}
              </div>

              {/* Step 2: Draft */}
              <div className={`border rounded-lg p-4 ${workflowState.step >= 2 ? 'border-stone-300 bg-white' : 'border-stone-200 bg-stone-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-800 text-white flex items-center justify-center text-xs font-bold">2</div>
                    <h3 className="font-medium text-stone-800">Agent 2: 正文扩写主笔</h3>
                  </div>
                  <button 
                    onClick={handleGenerateWorkflowDraft}
                    disabled={isWorkflowLoading || !workflowState.outline}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isWorkflowLoading && workflowState.step === 2 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    生成草稿
                  </button>
                </div>
                {workflowState.draft && (
                  <textarea
                    value={workflowState.draft}
                    onChange={(e) => setWorkflowState(prev => ({ ...prev, draft: e.target.value }))}
                    className="w-full h-48 p-3 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none"
                    placeholder="在此编辑草稿..."
                  />
                )}
              </div>

              {/* Step 3: Polish */}
              <div className={`border rounded-lg p-4 ${workflowState.step >= 3 ? 'border-stone-300 bg-white' : 'border-stone-200 bg-stone-50 opacity-50'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-stone-800 text-white flex items-center justify-center text-xs font-bold">3</div>
                    <h3 className="font-medium text-stone-800">Agent 3: 细节精修润色</h3>
                  </div>
                  <button 
                    onClick={handlePolishWorkflowDraft}
                    disabled={isWorkflowLoading || !workflowState.draft}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {isWorkflowLoading && workflowState.step === 3 ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    开始润色
                  </button>
                </div>
                {workflowState.polished && (
                  <textarea
                    value={workflowState.polished}
                    onChange={(e) => setWorkflowState(prev => ({ ...prev, polished: e.target.value }))}
                    className="w-full h-48 p-3 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none"
                    placeholder="在此编辑润色后的文本..."
                  />
                )}
              </div>

              {/* Apply Button */}
              {(workflowState.draft || workflowState.polished) && (
                <button
                  onClick={handleApplyWorkflowToChapter}
                  className="w-full py-3 bg-stone-800 hover:bg-stone-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <FileText size={16} />
                  应用到当前章节正文
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              <div className="text-sm text-stone-500 mb-6">
                大纲推演：由三位不同职责的 AI 专家进行多轮对话，针对你提出的剧情瓶颈或主题进行深度推演。
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-bold text-stone-600 mb-2 uppercase tracking-wider">推演主题 / 剧情瓶颈</label>
                  <textarea
                    value={brainstormTopic}
                    onChange={(e) => setBrainstormTopic(e.target.value)}
                    className="w-full h-24 p-3 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none"
                    placeholder="例如：主角在密室中如何逃脱？或者：反派的动机是什么？"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">推演轮数:</span>
                    <input 
                      type="number" 
                      min="1" 
                      max="5" 
                      value={brainstormRounds}
                      onChange={(e) => setBrainstormRounds(parseInt(e.target.value) || 1)}
                      className="w-12 p-1 text-xs border border-stone-200 rounded text-center"
                    />
                  </div>
                  <button
                    onClick={handleStartBrainstorm}
                    disabled={!brainstormTopic.trim() || isBrainstorming}
                    className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    {isBrainstorming ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                    开始推演
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                {brainstormHistory.map((msg) => (
                  <div key={msg.id} className="bg-white border border-stone-100 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-stone-800">{msg.agentName}</span>
                      <span className="text-[10px] text-stone-400 italic">{msg.agentRole}</span>
                    </div>
                    <div className="text-sm text-stone-600 whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isBrainstorming && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={24} className="text-stone-300 animate-spin" />
                  </div>
                )}
                {brainstormSummary && (
                  <div className="mt-8 p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <h4 className="text-sm font-bold text-emerald-900 mb-2 flex items-center gap-2">
                      <Sparkles size={16} /> 推演总结方案
                    </h4>
                    <div className="text-sm text-emerald-800 whitespace-pre-wrap leading-relaxed">
                      {brainstormSummary}
                    </div>
                  </div>
                )}
                <div ref={brainstormEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Dialog */}
      {dialog && dialog.isOpen && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="bg-white rounded-xl shadow-2xl w-[400px] max-w-[90vw] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-stone-800">{dialog.title}</h3>
              <button onClick={() => setDialog(null)} className="text-stone-400 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 text-stone-600">
              {dialog.message}
            </div>
            <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex justify-end gap-3">
              {dialog.type === 'confirm' && (
                <button 
                  onClick={() => setDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
                >
                  取消
                </button>
              )}
              <button 
                onClick={() => {
                  if (dialog.type === 'confirm' && dialog.onConfirm) {
                    dialog.onConfirm();
                  } else {
                    setDialog(null);
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-stone-800 text-stone-50 hover:bg-stone-700 rounded-lg transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Mobile Navigation Bar */}
      <div className={`
        ${viewMode === 'desktop' ? 'hidden' : 
          viewMode === 'mobile' ? 'flex' : 
          viewMode === 'tablet' ? 'hidden md:hidden' : 'md:hidden flex'} 
        border-t border-stone-200 bg-white h-16 shrink-0
      `}>
        <button
          onClick={() => setMobileActivePanel('navigation')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileActivePanel === 'navigation' ? 'text-stone-900 bg-stone-50' : 'text-stone-400'}`}
        >
          <Library size={20} />
          <span className="text-[10px] font-medium">导航</span>
        </button>
        <button
          onClick={() => setMobileActivePanel('editor')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileActivePanel === 'editor' ? 'text-stone-900 bg-stone-50' : 'text-stone-400'}`}
        >
          <FileText size={20} />
          <span className="text-[10px] font-medium">编辑器</span>
        </button>
        <button
          onClick={() => setMobileActivePanel('ai')}
          className={`flex-1 flex flex-col items-center justify-center gap-1 ${mobileActivePanel === 'ai' ? 'text-stone-900 bg-stone-50' : 'text-stone-400'}`}
        >
          <Sparkles size={20} />
          <span className="text-[10px] font-medium">AI 助手</span>
        </button>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[600px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-bold text-stone-800">全局设置</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-stone-400 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-8">
              
              {/* Layout Mode */}
              <section>
                <h4 className="text-sm font-bold text-stone-800 mb-4 uppercase tracking-wider flex items-center gap-2">
                  <Monitor size={16} className="text-purple-500" /> 界面布局模式
                </h4>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setViewMode('auto')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${viewMode === 'auto' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Sparkles size={20} />
                    <span className="text-xs font-medium">自动</span>
                  </button>
                  <button
                    onClick={() => setViewMode('mobile')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${viewMode === 'mobile' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Smartphone size={20} />
                    <span className="text-xs font-medium">手机</span>
                  </button>
                  <button
                    onClick={() => setViewMode('tablet')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${viewMode === 'tablet' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Tablet size={20} />
                    <span className="text-xs font-medium">平板</span>
                  </button>
                  <button
                    onClick={() => setViewMode('desktop')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${viewMode === 'desktop' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    <Monitor size={20} />
                    <span className="text-xs font-medium">电脑</span>
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-stone-400 italic text-center">
                  * 强制切换布局模式，方便在不同设备上预览效果。
                </p>
              </section>

              {/* Novel Management */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <Library size={16} className="text-indigo-500" /> 书架管理
                  </h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleBuildRAG} 
                      disabled={isBuildingRAG || activeNovel.chapters.length === 0}
                      className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-1 rounded flex items-center gap-1 disabled:opacity-50"
                      title="构建本地向量知识库，让AI能检索全书内容"
                    >
                      {isBuildingRAG ? <Loader2 size={12} className="animate-spin" /> : <Cpu size={12} />}
                      {isBuildingRAG ? `构建中 (${ragProgress.current}/${ragProgress.total})` : '构建RAG知识库'}
                    </button>
                    <button onClick={createNovel} className="text-xs bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-stone-700">
                      + 新建小说
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {workspace.novels.map(n => (
                    <div key={n.id} className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200 rounded-lg">
                      <span className="font-medium text-sm">{n.title}</span>
                      <div className="flex gap-2">
                        {workspace.activeNovelId !== n.id && (
                          <button onClick={() => updateWorkspace({ activeNovelId: n.id })} className="text-xs text-blue-600 hover:underline">
                            切换
                          </button>
                        )}
                        <button onClick={(e) => deleteNovel(n.id, e)} className="text-xs text-red-500 hover:underline">
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Data Management */}
              <section>
                <h4 className="text-sm font-bold text-stone-800 mb-4 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={16} className="text-blue-500" /> 当前小说导入与导出
                </h4>
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <input
                        type="file"
                        accept=".txt"
                        ref={fileInputRef}
                        onChange={handleImport}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors text-sm font-medium border border-stone-200"
                      >
                        <Upload size={16} />
                        导入 TXT (新建小说)
                      </button>
                    </div>
                    <div className="flex-1">
                      <button
                        onClick={handleExport}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-800 hover:bg-stone-700 text-stone-50 rounded-lg transition-colors text-sm font-medium"
                      >
                        <Download size={16} />
                        导出为 TXT
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <input
                        type="file"
                        accept=".json"
                        ref={metadataInputRef}
                        onChange={handleImportMetadata}
                        className="hidden"
                      />
                      <button
                        onClick={() => metadataInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg transition-colors text-sm font-medium border border-stone-200"
                      >
                        <Upload size={16} />
                        导入设定与摘要
                      </button>
                    </div>
                    <div className="flex-1">
                      <button
                        onClick={handleExportMetadata}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-stone-800 hover:bg-stone-700 text-stone-50 rounded-lg transition-colors text-sm font-medium"
                      >
                        <Download size={16} />
                        导出设定与摘要
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* AI Config */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-500" /> AI 接口管理
                  </h4>
                  <button onClick={addAIProfile} className="text-xs bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-stone-700">
                    + 添加配置
                  </button>
                </div>
                
                <div className="space-y-4">
                  {workspace.aiProfiles.map(profile => (
                    <div key={profile.id} className="p-4 bg-stone-50 border border-stone-200 rounded-lg space-y-3 relative">
                      <div className="flex justify-between items-center">
                        <input 
                          type="text" 
                          value={profile.name}
                          onChange={(e) => updateAIProfile(profile.id, { name: e.target.value })}
                          className="font-bold bg-transparent border-b border-stone-300 outline-none focus:border-stone-800 text-sm"
                          placeholder="配置名称"
                        />
                        <button onClick={() => deleteAIProfile(profile.id)} className="text-stone-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">提供商</label>
                          <select 
                            value={profile.provider}
                            onChange={(e) => updateAIProfile(profile.id, { provider: e.target.value as 'gemini' | 'custom' })}
                            className="w-full p-1.5 text-sm bg-white border border-stone-200 rounded"
                          >
                            <option value="gemini">Google Gemini (内置)</option>
                            <option value="custom">第三方 OpenAI 格式</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">模型 (Model)</label>
                          <input 
                            type="text" 
                            value={profile.model}
                            onChange={(e) => updateAIProfile(profile.id, { model: e.target.value })}
                            className="w-full p-1.5 text-sm bg-white border border-stone-200 rounded"
                            placeholder={profile.provider === 'gemini' ? 'gemini-3-flash-preview' : 'gpt-3.5-turbo...'}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-stone-500 mb-1">
                          {profile.provider === 'gemini' ? 'Gemini API Key (可选，留空使用内置)' : 'API Key'}
                        </label>
                        <input 
                          type="password" 
                          value={profile.key || ''}
                          onChange={(e) => updateAIProfile(profile.id, { key: e.target.value })}
                          className="w-full p-1.5 text-sm bg-white border border-stone-200 rounded"
                          placeholder={profile.provider === 'gemini' ? '在此填入你的 Gemini Key' : 'sk-...'}
                        />
                      </div>

                      {profile.provider === 'custom' && (
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">API Base URL</label>
                          <input 
                            type="text" 
                            value={profile.url || ''}
                            onChange={(e) => updateAIProfile(profile.id, { url: e.target.value })}
                            className="w-full p-1.5 text-sm bg-white border border-stone-200 rounded"
                            placeholder="https://api.openai.com/v1/chat/completions"
                          />
                        </div>
                      )}

                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="block text-xs text-stone-500">创造力 (Temperature): {profile.temperature}</label>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={profile.temperature}
                          onChange={(e) => updateAIProfile(profile.id, { temperature: parseFloat(e.target.value) })}
                          className="w-full accent-stone-800"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
