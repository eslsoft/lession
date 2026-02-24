# Lession — 设计文档

## 1. 产品概述

Lession 是一个本地优先的**无头内容管理客户端**（Electron），帮助内容创作者管理、转录、标注音视频内容，并发布到对象存储（S3 兼容）。

**核心流程：**

```
配置 S3 → 创建 Series
                 ├── Import（URL 或本地文件）→ Splitting Editor → 批量创建 Episodes
                 └── New Episode（单文件）→ 直接创建一个 Episode
                                                    ↓
                                          手动触发处理 Pipeline
                                                    ↓
                                               Review → 发布
```

**发布即上传：** 所有内容以文件形式存储在 S3。`index.json` 是所有 Series 的发现入口，每个 Series 有独立的 `feed.json`，消费方从 `index.json` 出发即可访问全部内容。

---

## 2. 核心概念

### Series

一个内容系列，支持以下类型：

| 类型 | 说明 |
|---|---|
| `course` | 课程，Episodes 有顺序 |
| `podcast` | 播客，按发布时间倒序 |
| `audiobook` | 有声书，严格章节顺序 |
| `video_series` | 视频系列 |

Series 类型主要影响 UI 呈现和 feed.json 的消费语义，底层数据模型统一。

### Episode

Series 下的单集内容，**强绑定一个媒体文件**（1:1）。支持替换媒体文件（重新录制），历史版本可保留。

Episode 独立发布，不依赖 Series 整体状态。

Episode 有两种创建方式：
- **New Episode**：选择本地单文件直接创建，适合已切好的单集内容
- **Split & Import**：从一个完整文件（本地或已下载）进入 Splitting Editor，拆分后批量创建

### Download

内置下载管理器的持久化条目，与 Series/Episode 解耦。用户在下载管理器中发起 URL 下载，完成后再决定如何使用该文件。

### Transcript

由 WhisperX（本地）生成的 word-level 文字稿，经 compromise NLP 处理后得到完整的语言标注数据。Transcript 是 Episode 的核心产出物，服务以下用途：

- 视频字幕（SRT / VTT）
- Podcast 文字稿（纯文本）
- 交互式 TranscriptEditor（点击跳转播放位置）
- 关键词、实体提取、全文搜索

---

## 3. 数据模型

### 3.1 Series

```typescript
interface Series {
  id: string
  title: string
  description?: string
  coverPath?: string       // 本地路径或已上传 S3 URL
  type: 'course' | 'podcast' | 'audiobook' | 'video_series'
  language: string         // 影响 WhisperX 语言参数，如 "en" / "zh"
  createdAt: string        // ISO 8601
  updatedAt: string
}
```

### 3.2 Episode

```typescript
interface Episode {
  id: string
  seriesId: string
  title: string
  description?: string
  order: number            // 排序序号
  mimeType: 'audio' | 'video'

  // 媒体文件
  localPath?: string       // 本地文件路径（处理阶段使用）
  remoteUrl?: string       // S3 URL（上传后）
  duration?: number        // 秒

  // 来源（可追溯）
  source?: {
    type: 'url' | 'local' | 'direct'  // url=yt-dlp, local=本地导入拆分, direct=New Episode
    origin?: string                    // 原始 URL 或文件路径
  }

  // 状态
  status: EpisodeStatus
  publishStatus: 'draft' | 'preview' | 'published'
  lastError?: {            // 与 status 独立，记录最近一次错误
    message: string
    occurredAt: string
  }

  createdAt: string
  updatedAt: string
}

type EpisodeStatus =
  | 'pending'          // 刚创建，未导入媒体
  | 'ready_to_process' // 已导入媒体，等待手动触发
  | 'transcribing'     // WhisperX 处理中
  | 'nlp_processing'   // compromise 处理中
  | 'uploading'        // 上传 S3 中（处理全部完成后）
  | 'done'             // 全部完成，可 review
```

### 3.3 Download

```typescript
interface Download {
  id: string
  url: string
  filename: string
  localPath?: string
  status: 'pending' | 'downloading' | 'done' | 'error'
  progress: number          // 0-100
  // yt-dlp 提取的 metadata
  title?: string
  thumbnailUrl?: string
  duration?: number         // 秒
  chapters?: {              // 有章节时可直接预填 Splitting Editor
    title: string
    startTime: number       // 秒
    endTime: number
  }[]
  lastError?: string
  createdAt: string
}
```

Download 是全局实体，不属于任何 Series。文件存储在 `downloadDir`，用户手动管理删除。

### 3.4 Transcript

```typescript
interface Transcript {
  id: string
  episodeId: string
  language: string
  status: 'transcribing' | 'transcribed' | 'nlp_processing' | 'ready'
  segments: Segment[]
  createdAt: string
  updatedAt: string
}

interface Segment {
  start: number            // 秒
  end: number
  text: string             // 整段文本，用户可直接编辑
  edited: boolean          // 是否被手动修改过
  speaker?: string         // WhisperX diarization（说话人）
  words: WordToken[]       // 原始 word-level 数据，编辑后保留不动
}

// 每个 word 携带 WhisperX + compromise 全量数据
interface WordToken {
  // ── WhisperX ──────────────────────────────────
  word: string             // 原始词，如 "running"
  start: number            // 秒
  end: number
  score: number            // 识别置信度 0-1

  // ── compromise NLP（NLP 阶段完成后填入）────────
  normal: string | null    // 标准化/词根，如 "run"
  tags: string[] | null    // 全量标签，如 ["Verb", "Gerund", "PresentTense"]
  chunk: string | null     // 短语类型，如 "VerbPhrase" | "NounPhrase"
  pre: string | null       // 词前标点/空白
  post: string | null      // 词后标点/空白
}
```

**compromise tags 说明：** tags 是分层的，一个词可同时携带多个标签，全部保留：

```
词性层：  Noun / Verb / Adjective / Adverb / Preposition ...
细分层：  Singular / Plural / ProperNoun / Acronym
          Infinitive / PastTense / Gerund / PresentTense
实体层：  Person / Place / Organization / Date / Value / Currency
```

---

## 4. Import 流程

### 两个入口，统一的文件来源

```
下载管理器（URL → yt-dlp）
  └── 下载完成的条目
        ├── [Create Episode]   → 选择 Series → 创建单集
        └── [Split & Import]   → 选择 Series → Splitting Editor → 批量创建

Series 页面（本地文件）
  ├── [New Episode]            → 选择本地单文件 → 创建单集
  └── [Split & Import]         → 选择本地文件  → Splitting Editor → 批量创建
```

### 下载管理器

- 全局入口，不依附于任何 Series
- 用户输入 URL，yt-dlp 后台下载，实时显示进度
- 下载记录持久化（`downloads` 表），可查看历史、重试失败项
- 完成后条目保留，用户可随时对文件执行操作
- 检测到 chapters 时，`[Split & Import]` 按钮会自动预填 Splitting Editor 的标记点

### Splitting Editor

接受 `localFilePath`（和可选的预填章节），完全不感知文件来源（下载还是本地）：

- 波形 / 时间轴显示，可添加 / 移动 / 删除标记点
- 每个片段可设置标题
- 选择目标 Series
- 确认后 ffmpeg 按标记点切割，批量创建 Episodes `{ status: 'ready_to_process' }`

### New Episode

选择本地单文件或从下载条目直接创建 → `{ status: 'ready_to_process', source.type: 'direct'/'url' }`，不经过 Splitting Editor。

---

## 5. Pipeline

### 触发方式

**手动触发（B 模式）：** 用户导入媒体文件后，状态置为 `ready_to_process`，由用户手动点击"开始处理"。

### 处理阶段

```
[用户点击"开始处理"]
        │
        ▼
① 本地 WhisperX 转录         status: transcribing
   输入：localPath（本地文件）
   解析 stdout 实时推送进度到 UI
   生成 word-level segments
        │
        ▼
② 生成 SRT / VTT             （基于 segments，同步快速完成）
        │
        ▼
③ compromise NLP 处理        status: nlp_processing
   为每个 WordToken 填入
   normal / tags / chunk / pre / post
        │
        ▼
④ 上传到 S3                  status: uploading
   媒体文件 + transcript.json + srt + vtt
        │
        ▼
⑤ 写入本地 SQLite            status: done
   可进入 TranscriptEditor Review
```

### 大文件处理

WhisperX 内部通过 VAD（语音活动检测）自动分段处理，输出的时间戳已是全局时间，无需手动切片合并。

对于长音频（如 1 小时以上），处理时间较长，通过**解析 WhisperX 的 stdout 进度输出**实时向 UI 推送百分比进度，避免界面无响应的感知问题。

### 错误处理

任一阶段失败：
- `status` 保持在失败时的阶段不变
- `lastError` 记录错误信息和时间
- 支持从当前阶段重试，重试时清空 `lastError`

---

## 6. 本地存储（SQLite）

本地数据库使用 `better-sqlite3`，存储所有 Series、Episode、Transcript 数据。

S3 是**发布目标**，不是数据库。本地 SQLite 是单一数据源，发布操作是将本地数据序列化后上传。

**存储策略：**

- `segments` 字段以 JSONB 形式存储在 `transcripts` 表
- Transcript 完整 JSON 同时作为文件存储（便于直接上传 S3）

---

## 7. S3 存储结构

```
s3://{bucket}/
  ├── index.json                    ← 所有 Series 的发现入口
  └── {seriesId}/                   ← 每个 Series 独立目录（以 UUID 命名）
        ├── feed.json               ← 该 Series 的 JSON Feed
        ├── cover.jpg
        └── {episodeId}/
              ├── media.mp4         ← 或 .mp3 / .m4a 等
              ├── transcript.json   ← 完整 word-level + NLP 数据
              ├── subtitle.srt
              └── subtitle.vtt
```

### index.json 格式

```json
{
  "version": "1",
  "updatedAt": "2024-03-01T00:00:00Z",
  "series": [
    {
      "id": "uuid-1",
      "title": "Modern React Patterns",
      "type": "course",
      "language": "en",
      "cover": "https://s3.example.com/uuid-1/cover.jpg",
      "feedUrl": "https://s3.example.com/uuid-1/feed.json",
      "publishedAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "uuid-2",
      "title": "The Dev Podcast",
      "type": "podcast",
      "language": "zh",
      "cover": "https://s3.example.com/uuid-2/cover.jpg",
      "feedUrl": "https://s3.example.com/uuid-2/feed.json",
      "publishedAt": "2024-02-01T00:00:00Z"
    }
  ]
}
```

`index.json` 只在有 Series 被发布/取消发布时重新生成上传，不随每次 Episode 发布而改变。

---

## 8. 发布机制

### 7.1 发布状态

| 状态 | 含义 | 在 feed.json 中 |
|---|---|---|
| `draft` | 本地草稿，未上传 | 不存在 |
| `preview` | 文件已上传，供内部预览 | 包含，`_status: "preview"` |
| `published` | 正式发布 | 包含，`_status: "published"` |

`preview` 状态的 Episode 文件已在 S3 上，可通过直接 URL 访问，但消费方**默认不展示**，由消费方根据 `_status` 字段自行决定过滤策略。

### 7.2 发布操作

**发布单集（Episode 级别）：**

1. 确认 Episode status 为 `done`
2. 上传媒体文件、transcript.json、srt、vtt 到 `{seriesId}/{episodeId}/`
3. 将 Episode `publishStatus` 置为目标状态
4. 重新生成并上传该 Series 的 `feed.json`

**发布 / 下线 Series：**

1. Series 下有至少一个 `published` Episode 时，Series 出现在 `index.json`
2. 重新生成并上传 `index.json`

**两个文件的更新时机：**

| 文件 | 更新时机 |
|---|---|
| `{seriesId}/feed.json` | 任意 Episode 发布状态变更时 |
| `index.json` | Series 首次有 Episode 发布 / 最后一个 Episode 下线时 |

### 7.3 feed.json 格式

基于 [JSON Feed 1.1](https://jsonfeed.org/version/1.1/) 规范，使用 `_` 前缀扩展字段携带自定义数据。

```json
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "Modern React Patterns",
  "description": "A deep dive into advanced React patterns.",
  "icon": "https://s3.example.com/my-course/cover.jpg",
  "language": "en",
  "_type": "course",
  "_id": "550e8400-e29b-41d4-a716-446655440000",

  "items": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "title": "Episode 1: Compound Components",
      "summary": "We explore the compound component pattern...",
      "date_published": "2024-03-01T00:00:00Z",
      "attachments": [
        {
          "url": "https://s3.example.com/my-course/ep1/media.mp4",
          "mime_type": "video/mp4",
          "duration_in_seconds": 3642
        }
      ],
      "_order": 1,
      "_status": "published",
      "_transcript_url": "https://s3.example.com/my-course/ep1/transcript.json",
      "_subtitles": {
        "srt": "https://s3.example.com/my-course/ep1/subtitle.srt",
        "vtt": "https://s3.example.com/my-course/ep1/subtitle.vtt"
      }
    }
  ]
}
```

**标准字段**（title、attachments、date_published）对任意 JSON Feed 消费方透明可读；**`_` 扩展字段**携带平台特有信息。

---

## 9. 配置项

通过 `electron-store` 持久化存储，用户在首次启动时配置。

```typescript
interface AppConfig {
  storage: {
    endpoint: string       // S3 兼容端点，如 "https://s3.amazonaws.com"
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    publicBaseUrl: string  // 文件公开访问的 URL 前缀
  }
  transcription: {
    provider: 'local_whisperx'
    whisperxPath: string   // whisperx 可执行文件路径
    device: 'cpu' | 'cuda' | 'mps'
    computeType: string    // "float16" | "int8" 等
    defaultLanguage: string
  }
  import: {
    ytdlpPath: string      // yt-dlp 可执行文件路径
    downloadDir: string    // 下载临时目录
  }
}
```

---

## 10. 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Electron + Vite + React + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| 本地数据库 | better-sqlite3 |
| 对象存储 | @aws-sdk/client-s3 |
| 任务队列 | 主进程内置队列（BullMQ 或简单 async queue） |
| NLP | compromise |
| 配置持久化 | electron-store |
| 状态管理（renderer） | Zustand |
| 下载 | yt-dlp（子进程调用） |
| 媒体处理 | ffmpeg（切割）、ffprobe（元数据读取） |
| 波形显示 | wavesurfer.js |

---

## 11. 目录结构（规划）

```
src/
├── main/
│   ├── index.ts
│   ├── db/
│   │   ├── schema.ts          # 建表 DDL
│   │   └── repositories/      # series, episode, transcript, download
│   ├── services/
│   │   ├── storage.ts         # S3 上传、URL 生成
│   │   ├── transcription.ts   # 调用本地 WhisperX 子进程
│   │   ├── nlp.ts             # compromise 处理
│   │   ├── subtitle.ts        # 生成 SRT / VTT
│   │   ├── pipeline.ts        # 编排转录/NLP/上传，管理 Episode 状态流转
│   │   ├── publisher.ts       # 生成并上传 feed.json / index.json
│   │   ├── downloader.ts      # yt-dlp 子进程封装，进度通过 IPC 推送到 UI
│   │   └── splitter.ts        # ffmpeg 切割，ffprobe 元数据读取
│   └── ipc/
│       ├── series.ipc.ts
│       ├── episode.ipc.ts
│       ├── transcript.ipc.ts
│       └── downloader.ipc.ts  # 触发下载、暂停/取消、查询下载列表
│
├── renderer/
│   ├── pages/
│   │   ├── Setup/             # 首次配置（S3、WhisperX、yt-dlp）
│   │   ├── Downloads/         # 下载管理器（全局）
│   │   ├── SeriesView/        # Series 列表 + Episode 列表
│   │   ├── EpisodeDetail/     # 播放器 + TranscriptEditor + NLP 面板
│   │   └── SplittingEditor/   # 波形 + 标记点 + 片段列表
│   ├── components/
│   │   ├── MediaPlayer/
│   │   ├── TranscriptEditor/  # 字幕联动播放器，NLP 高亮
│   │   ├── NLPPanel/
│   │   └── Waveform/          # wavesurfer.js 封装
│   └── stores/                # Zustand stores
│
└── shared/
    └── types.ts               # 跨进程共享的 TypeScript 类型
```
