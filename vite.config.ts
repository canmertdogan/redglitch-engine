import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'studio-ui'),
  base: '/studio-dist/',
  build: {
    outDir: path.resolve(__dirname, 'public/studio-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        item_editor: path.resolve(__dirname, 'studio-ui/item_editor.html'),
        npc_editor: path.resolve(__dirname, 'studio-ui/npc_editor.html'),
        enemy_editor: path.resolve(__dirname, 'studio-ui/enemy_editor.html'),
        dashboard: path.resolve(__dirname, 'studio-ui/dashboard.html'),
        quest_editor: path.resolve(__dirname, 'studio-ui/quest_editor.html'),
        dialogue_editor: path.resolve(__dirname, 'studio-ui/dialogue_editor.html'),
        script_editor: path.resolve(__dirname, 'studio-ui/script_editor.html'),
        pixel_editor: path.resolve(__dirname, 'studio-ui/pixel_editor.html'),
        algorithm_editor: path.resolve(__dirname, 'studio-ui/algorithm_editor.html'),
        daw_editor: path.resolve(__dirname, 'studio-ui/daw_editor.html'),
        fx_editor: path.resolve(__dirname, 'studio-ui/fx_editor.html'),
        shader_editor: path.resolve(__dirname, 'studio-ui/shader_editor.html'),
        prefab_editor: path.resolve(__dirname, 'studio-ui/prefab_editor.html'),
        asset_manager: path.resolve(__dirname, 'studio-ui/asset_manager.html'),
        interactive_cutscene_editor: path.resolve(__dirname, 'studio-ui/interactive_cutscene_editor.html'),
        ui_designer: path.resolve(__dirname, 'studio-ui/ui_designer.html'),
        studio_main: path.resolve(__dirname, 'studio-ui/studio_main.html'),
      },
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (!normalized.includes('/node_modules/')) return undefined;
          if (
            normalized.includes('/node_modules/react/') ||
            normalized.includes('/node_modules/react-dom/') ||
            normalized.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/lucide-react/')) {
            return 'vendor-icons';
          }
          if (
            normalized.includes('/node_modules/@monaco-editor/') ||
            normalized.includes('/node_modules/monaco-editor/')
          ) {
            return 'vendor-monaco';
          }
          return undefined;
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'studio-ui/src'),
      '@shared': path.resolve(__dirname, 'public/shared'),
    }
  },
  server: {
    proxy: {
      // 127.0.0.1, not localhost: the Express server binds IPv4 loopback only
      // (see server/config.js HOST), and "localhost" can resolve to ::1 first.
      '/api': 'http://127.0.0.1:3000',
      '/dunyalar': 'http://127.0.0.1:3000',
      '/assets': 'http://127.0.0.1:3000',
      '/muzikler': 'http://127.0.0.1:3000',
      '/shared': 'http://127.0.0.1:3000',
      '/base_game': 'http://127.0.0.1:3000',
      '/fonts': 'http://127.0.0.1:3000',
      '/lib': 'http://127.0.0.1:3000',
      '/engines': 'http://127.0.0.1:3000',
      '/sprite-art': 'http://127.0.0.1:3000',
      '/ai': 'http://127.0.0.1:3000',
      '/data': 'http://127.0.0.1:3000',
      '/interfaces': 'http://127.0.0.1:3000',
    }
  }
});
