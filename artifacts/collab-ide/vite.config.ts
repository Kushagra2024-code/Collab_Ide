import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Use defaults when env vars are not set (local dev / Docker build)
const port = Number(process.env.PORT ?? '3000');
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    // Replit-specific plugins — only loaded inside Replit environment
    ...(process.env.REPL_ID !== undefined
      ? [
          // Runtime error overlay (optional, best-effort)
          ...(await import('@replit/vite-plugin-runtime-error-modal')
            .then((m) => [m.default()])
            .catch(() => [])),
          ...(process.env.NODE_ENV !== 'production'
            ? await Promise.all([
                import('@replit/vite-plugin-cartographer').then((m) =>
                  m.cartographer({ root: path.resolve(import.meta.dirname, '..') })
                ).catch(() => null),
                import('@replit/vite-plugin-dev-banner').then((m) =>
                  m.devBanner()
                ).catch(() => null),
              ]).then((r) => r.filter(Boolean) as any[])
            : []),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(import.meta.dirname, '..', '..', 'attached_assets'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false, // allow fallback port
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
