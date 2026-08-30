import fs from 'fs';
import path from 'path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'child_process';
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

const localAssetRoot = path.resolve(import.meta.dirname, 'public');
const attachedAssetRoot = path.resolve(import.meta.dirname, '..', '..', 'attached_assets');
const portableApiOrigin =
  process.env.VITE_STOP_LOSS_API_ORIGIN ||
  process.env.STOP_LOSS_API_ORIGIN ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
const buildOutputDir = process.env.STOP_LOSS_BUILD_OUT_DIR
  ? path.resolve(process.env.STOP_LOSS_BUILD_OUT_DIR)
  : path.resolve(import.meta.dirname, 'dist/public');

function indexWorkbookCandidates() {
  return fs
    .readdirSync(attachedAssetRoot)
    .filter((name) => /^Indexes_.*\.xlsx$/i.test(name))
    .map((name) => ({
      name,
      modified: fs.statSync(path.join(attachedAssetRoot, name)).mtimeMs,
      bytes: fs.readFileSync(path.join(attachedAssetRoot, name)),
    }))
    .map((candidate) => ({
      ...candidate,
      sourceId: `sha256:${createHash('sha256').update(candidate.bytes).digest('hex')}`,
      isVerifiedAugust: /^Indexes[_ -]*8[-_]2026/i.test(candidate.name),
    }))
    .sort((a, b) => {
      // Filename/date selection is deliberate and stable.  A later mtime must
      // never make the legacy v10 workbook win over the verified August seed.
      if (a.isVerifiedAugust !== b.isVerifiedAugust) return a.isVerifiedAugust ? -1 : 1;
      if (a.sourceId !== b.sourceId) return a.sourceId.localeCompare(b.sourceId);
      return a.name.localeCompare(b.name);
    });
}

function latestIndexWorkbook(): string | null {
  const candidates = indexWorkbookCandidates();
  return candidates.length ? path.join(attachedAssetRoot, candidates[0].name) : null;
}

function readIndexData(): string {
  const workbook = latestIndexWorkbook();
  if (!workbook) {
    return JSON.stringify({
      sourceFile: '', sourceId: '', tabs: [], rawTabs: [], availableTabs: [],
      unavailableLookups: [], canonicalMetadata: { sourcePolicy: 'verified-August-2026-preferred; no v10 mixing' },
    });
  }
  const parser = path.resolve(import.meta.dirname, 'scripts', 'read-index-workbook.py');
  const parsed = JSON.parse(execFileSync('python', [parser, workbook], { encoding: 'utf8' }).trim());
  const selected = indexWorkbookCandidates()[0];
  return JSON.stringify({
    ...parsed,
    sourceKind: 'offline-seed',
    storageLocation: 'Embedded offline seed in the generated HTML',
    sourceModifiedAt: new Date(fs.statSync(workbook).mtimeMs).toISOString(),
    availableSourceFiles: indexWorkbookCandidates().map((candidate) => ({
      name: candidate.name,
      sourceId: candidate.sourceId,
      equivalentProvenance: candidate.sourceId === selected.sourceId,
      verifiedAugust: candidate.isVerifiedAugust,
      modifiedAt: new Date(candidate.modified).toISOString(),
      location: 'Offline build seed input',
    })),
  });
}

function inlineIndexData(): string {
  const content = readIndexData()
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  return `<script data-inlined-asset="index-reference-data.js">window.TINUBU_INDEX_DATA=${content};</script>`;
}

function readLocalAsset(name: string): string {
  return fs.readFileSync(path.join(localAssetRoot, name), 'utf8');
}

function inlineTag(tag: 'style' | 'script', name: string): string {
  const content = readLocalAsset(name).replace(/<\/(script|style)/gi, '<\\/$1');
  return `<${tag} data-inlined-asset="${name}">\n${content}\n</${tag}>`;
}

function inlineStopLossAssets(html: string): string {
  const styles = [
    'licensing-suite.css',
    'quote-party-selector.css',
    'ai-upload-prompts.css',
    'cloud-sync.css',
  ];
  let result = html.replace(
    'window.__STOP_LOSS_BUILD_API_ORIGIN__',
    JSON.stringify(portableApiOrigin),
  );
  result = result.replace(/<\/head>/i, () => `${inlineIndexData()}\n</head>`);

  styles.forEach((name) => {
    result = result.replace(
      new RegExp(`<link\\s+rel=["']stylesheet["']\\s+href=["']/${name}["']\\s*/?>`, 'i'),
      () => inlineTag('style', name),
    );
  });

  result = result.replace(
    /<script\s+src=["']\/cloud-sync\.js["']\s*><\/script>/i,
    () => inlineTag('script', 'cloud-sync.js'),
  );
  result = result.replace(
    /<script\s+src=["']\/enrollment-history\.js["']\s*><\/script>/i,
    () => inlineTag('script', 'enrollment-history.js'),
  );

  // Preserve the source workspace's dependency order: licensing state first,
  // then the Gemini adapter, prompt UI, party selector, and licensing guards.
  result = result.replace(
    /<script>\s*\/\* The workspace UI is intentionally public\.[\s\S]*?<\/script>/i,
    () => [
      '<!-- Local workspace modules are inlined at build time. Remote vendor',
      'resources above remain CDN dependencies for fonts, icons, maps, and',
      'document parsing/PDF generation. Protected workspace APIs stay same-origin. -->',
      inlineTag('script', 'licensing-rules.js'),
      inlineTag('script', 'licensing-suite.js'),
       inlineTag('script', 'index-reference-runtime.js'),
      inlineTag('script', 'stop-loss-gemini.js'),
      inlineTag('script', 'ai-upload-prompts.js'),
      inlineTag('script', 'quote-party-selector.js'),
      inlineTag('script', 'licensing-integration.js'),
    ].join('\n'),
  );

  return result;
}

export default defineConfig({
  base: basePath,
  plugins: [
    {
      name: 'inline-stop-loss-workspace-assets',
      transformIndexHtml: {
        order: 'pre',
        handler: inlineStopLossAssets,
      },
    },
    {
      name: 'deny-retired-public-licensing-seed',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/healthz') return next();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('ok');
        });
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/licensing-data.js') return next();
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Not found.' }));
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/healthz') return next();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('ok');
        });
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/licensing-data.js') return next();
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Not found.' }));
        });
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
  // The workspace is delivered as one HTML file. The source modules in
  // public/ are build-time inputs only and must not be copied beside it.
  publicDir: false,
  build: {
    outDir: buildOutputDir,
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
