import { defineConfig } from 'vite';

const appVersion = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0-dev';

// https://vitejs.dev/config
export default defineConfig(async () => {
  const react = (await import('@vitejs/plugin-react')).default;
  const tailwindcss = (await import('@tailwindcss/vite')).default;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': '/src',
        '@shared': '/src/shared',
        '@renderer': '/src/renderer',
      },
    },
  };
});
