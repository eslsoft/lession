# Lession

A local-first desktop app for managing educational audio/video content — with built-in transcription, NLP analysis, and one-click publishing to S3.

Designed for content creators, educators, and podcast producers who need to efficiently process, annotate, and distribute their audio/video content.

## Features

- **Content Management** — Organize content into Series (courses, podcasts, audiobooks, video series) and Episodes
- **Media Import** — Download from URLs via yt-dlp, or import local files
- **Waveform Splitting** — Visual waveform editor with silence detection for splitting long recordings into episodes
- **Automatic Transcription** — Word-level transcription via WhisperX (local) or Replicate (cloud)
- **NLP Analysis** — POS tagging, phrase chunking, and named entity recognition powered by spaCy
- **Publishing Pipeline** — Draft → Preview → Published workflow with S3 upload and JSON Feed generation
- **Cross-platform** — Windows, macOS, and Linux

## Install

### macOS (Homebrew)

```bash
brew install --cask eslsoft/tap/lession
```

### macOS / Windows (Manual)

Download the latest installer from [GitHub Releases](https://github.com/eslsoft/lession/releases):

- **macOS**: `.dmg` file
- **Windows**: `.exe` installer (Squirrel)

### External Dependencies

Lession shells out to the following tools. Install the ones you need:

| Tool | Purpose | Install |
|------|---------|---------|
| [ffmpeg](https://ffmpeg.org) | Media processing & waveform extraction | `brew install ffmpeg` |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Download media from URLs | `brew install yt-dlp` |
| [WhisperX](https://github.com/m-bain/whisperX) | Local speech-to-text transcription | `pip install whisperx` |
| [uv](https://github.com/astral-sh/uv) + [spaCy](https://spacy.io) | NLP analysis | `pip install uv` |

> Alternatively, you can use the **Replicate** cloud API for transcription instead of local WhisperX — configure it in Settings.

## Quick Start

1. Launch Lession and complete the **Setup** wizard (S3 credentials, transcription provider, tool paths)
2. Create a **Series** (e.g., "My Podcast")
3. Import media — paste a URL to download, or import a local file
4. Optionally **split** long recordings using the waveform editor
5. **Transcribe** episodes with one click
6. **Publish** to S3 — Lession generates a JSON Feed and uploads everything automatically

## Tech Stack

Electron 40 · React 19 · TypeScript · Vite · Tailwind CSS 4 · SQLite (better-sqlite3) · Zustand

## License

[MIT](LICENSE)
