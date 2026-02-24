# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev
npm start                        # Launch Electron app (electron-forge + vite)
npx tsc --noEmit                 # Type check (no tests in this project)
npm run lint                     # ESLint

# Build & Package
npm run package                  # Build distributable
npm run make                     # Create platform installers
```

## Architecture

Electron desktop app (Electron 40 + React 19 + Vite) for managing educational podcast/audiobook content with transcription, publishing, and S3 delivery.

### Process Boundary

```
Main Process (Node)          Preload (contextBridge)         Renderer (React)
src/main/                    src/preload.ts                  src/renderer/
  ├── db/repositories/         exposes window.electronAPI      ├── stores/ (Zustand)
  ├── ipc/  ←───── IPC ─────→                                 ├── pages/
  └── services/                                                └── components/
```

All renderer↔main communication goes through `window.electronAPI` (typed in `src/shared/types.ts` as `ElectronAPI`). IPC channels are defined in `src/shared/ipc-channels.ts`.

### Key Layers

- **Database**: better-sqlite3 with raw SQL. Schema + migrations in `src/main/db/schema.ts`. Repository pattern in `src/main/db/repositories/` (one file per entity).
- **IPC**: Each domain has a `src/main/ipc/*.ipc.ts` handler file, all registered in `src/main/index.ts`.
- **Services**: Business logic in `src/main/services/` — spawns external tools (WhisperX, spaCy via `uv run`, yt-dlp, ffmpeg) as child processes.
- **State**: Zustand stores in `src/renderer/stores/` mirror server-side entities. Stores call `window.electronAPI` in async actions.
- **UI**: shadcn/ui-style components in `src/renderer/components/ui/`, Tailwind CSS 4, Lucide icons.
- **Routing**: HashRouter — `/series`, `/series/:id`, `/series/:seriesId/episodes/:episodeId`, `/downloads`, `/split`.

### Custom Protocol

`local-media://` protocol (`src/main/protocol.ts`) streams local audio/video files with HTTP range request support for seeking.

### Publishing Pipeline

Episodes go through Draft → Preview → Published. The publisher service generates JSON Feed + catalog index and uploads to S3. Path conventions in `src/shared/s3-keys.ts`.

### Shared Types

`src/shared/types.ts` is the single source of truth for all entity interfaces (`Series`, `Episode`, `Transcript`, `Download`, `AppConfig`) and the full `ElectronAPI` interface.

## Path Aliases

`@/*` → `src/*`, `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/*`

## External Tool Dependencies (not bundled)

The app shells out to these tools which must be installed on the user's system:
- **WhisperX** — speech-to-text transcription
- **spaCy** (via `uv run scripts/nlp_spacy.py`) — NLP analysis
- **yt-dlp** — media downloading
- **ffmpeg/ffprobe** — media splitting and waveform extraction
