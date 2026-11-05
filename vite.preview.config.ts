import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'C:/Users/Lenovo/.codex/visualizations/2026/10/30/01a18cbc-545f-7481-9ee6-1c77ddc1a60d/ino-erp-preview-build',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'design-preview.source.html'),
    },
  },
});
