# Contributing to Lession

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **Python 3** (for WhisperX / spaCy integration)
- **ffmpeg** installed and available in `$PATH`

### Getting Started

```bash
# Clone the repo
git clone https://github.com/eslsoft/lession.git
cd lession

# Install dependencies
npm install

# Start the app in dev mode
npm start
```

### Useful Commands

```bash
npm start          # Launch Electron app (dev mode with hot reload)
npx tsc --noEmit   # Type check
npm run lint        # Run ESLint
npm run package     # Build distributable
npm run make        # Create platform installers
```

## Project Structure

```
src/
├── main/                  # Electron main process (Node.js)
│   ├── db/                # SQLite schema & repository pattern
│   ├── ipc/               # IPC handler files (one per domain)
│   └── services/          # Business logic & external tool wrappers
├── preload.ts             # contextBridge (exposes window.electronAPI)
├── renderer/              # React UI
│   ├── components/        # UI components (shadcn/ui style)
│   ├── pages/             # Route pages
│   └── stores/            # Zustand state management
└── shared/                # Shared types & constants
    ├── types.ts           # Single source of truth for all interfaces
    ├── ipc-channels.ts    # IPC channel definitions
    └── s3-keys.ts         # S3 path conventions
```

### Architecture Notes

- All renderer ↔ main communication goes through `window.electronAPI` (typed in `src/shared/types.ts`)
- Database uses raw SQL with better-sqlite3 — schema and migrations live in `src/main/db/schema.ts`
- Path aliases: `@/*` → `src/*`, `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/*`

## How to Contribute

1. **Fork** the repo and create a feature branch from `master`
2. Make your changes
3. Run `npx tsc --noEmit` and `npm run lint` to ensure no errors
4. **Commit** with clear, descriptive messages
5. Open a **Pull Request** against `master`

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow the existing code style (TypeScript strict mode, ESLint rules)
- Add types to `src/shared/types.ts` for any new IPC interfaces or data models
- New IPC channels should be defined in `src/shared/ipc-channels.ts` with a handler file in `src/main/ipc/`

## Reporting Issues

Found a bug or have a feature request? [Open an issue](https://github.com/eslsoft/lession/issues) with:

- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Platform and OS version

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
