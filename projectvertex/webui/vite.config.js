import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// projectvertex's own dev server, proxying to its own Express server (not
// Redglitch's port 3000) — this UI is independent of the Redglitch server.
export default defineConfig({
    plugins: [react()],
    root: __dirname,
    build: {
        outDir: path.resolve(__dirname, 'dist'),
        emptyOutDir: true,
    },
    server: {
        port: 4173,
        proxy: {
            '/api': 'http://localhost:4100',
            '/ws': { target: 'ws://localhost:4100', ws: true },
        },
    },
});
