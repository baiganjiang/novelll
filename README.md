# AI Novel Studio

AI Novel Studio 是一款功能强大的 AI 辅助小说创作工具，旨在帮助创作者更高效地构思、撰写和管理小说。

## 🌟 核心功能

- **多端支持**：基于 Capacitor 构建，支持 Web、Android 和 iOS。
- **智能创作**：集成 Gemini 3 系列模型，支持章节大纲生成、正文续写、文风润色等。
- **角色与设定管理**：内置角色卡和世界观设定（Lorebook）管理系统。
- **RAG 知识库**：利用 Transformers.js 在本地实现 RAG，自动检索小说历史背景，确保创作连贯性。
- **头脑风暴模式**：支持多 AI 角色参与的头脑风暴，碰撞灵感火花。
- **灵活的 AI 接口**：支持直接使用 Gemini API，或通过自定义 OpenAI 兼容接口连接各种大模型。
- **离线存储**：所有创作内容均存储在本地（IndexedDB / LocalStorage），保护隐私。

## 🛠️ 技术栈

- **前端**：React 19 + TypeScript + Vite
- **样式**：Tailwind CSS 4
- **动画**：Motion (Framer Motion)
- **图标**：Lucide React
- **移动端**：Capacitor 8
- **AI 引擎**：@google/genai (Gemini), @xenova/transformers (本地 Embedding)
- **后端**：Express (用于 Web 端 API 代理)

## 🚀 快速开始

### 1. 环境准备

确保你已安装 Node.js (建议 v20.20.0+) 和 npm。

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

在根目录创建 `.env` 文件（或在 AI Studio 环境设置中配置）：

```env
GEMINI_API_KEY=你的_GEMINI_API_KEY
VITE_API_BASE_URL=http://localhost:3000
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 即可开始使用。

## 📱 移动端构建 (Android/iOS)

### 同步代码到移动端项目

```bash
npm run mobile:sync
```

### 打开 Android Studio / Xcode

```bash
# 打开 Android 项目
npm run mobile:open:android

# 打开 iOS 项目
npm run mobile:open:ios
```

## 📁 项目结构

- `src/components/`：可复用的 UI 组件
- `src/services/`：AI 调用、RAG 检索等核心逻辑
- `src/types.ts`：全局类型定义
- `server.ts`：Express 后端代理服务器
- `capacitor.config.ts`：移动端配置文件

## 📄 许可证

MIT License
