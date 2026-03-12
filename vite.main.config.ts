import { defineConfig } from 'vite';

const appVersion = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0-dev';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    rollupOptions: {
      external: [
        'better-sqlite3',
        '@ffmpeg-installer/ffmpeg',
        '@ffprobe-installer/ffprobe',
      ],
      output: {
        entryFileNames: 'main.js',
      },
    },
  },
});
