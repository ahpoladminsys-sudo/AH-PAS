import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'inline-project-library-assets',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const entries = Object.values(bundle);
        const css = entries
          .filter((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'))
          .map((entry) => String(entry.source))
          .join('\n');
        const js = entries
          .filter((entry) => entry.type === 'chunk' && entry.isEntry)
          .map((entry) => entry.code)
          .join('\n');
        const html = bundle['index.html'];
        if (html?.type === 'asset') {
          let output = String(html.source).replace(
            /<link[^>]+rel=["']stylesheet["'][^>]*>/gi,
            () => css ? `<style data-inlined-asset="project-apps-library.css">\n${css}\n</style>` : '',
          );
          output = output.replace(
            /<script[^>]+type=["']module["'][^>]+src=["'][^"']+["'][^>]*><\/script>/i,
            () => `<script type="module" data-inlined-asset="project-apps-library.js">\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`,
          );
          html.source = output.replace(/<link[^>]+rel=["']icon["'][^>]*>/gi, '');
        }
        for (const fileName of Object.keys(bundle)) {
          if (fileName !== 'index.html') delete bundle[fileName];
        }
      },
    },
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  // Public files would create additional output files. The production
  // artifact is intentionally one downloadable HTML document.
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
