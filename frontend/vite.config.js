import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      },
      '/_uploads': {
        target: 'http://localhost:3000'
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // CodeMirror themes - split into separate chunk
          'codemirror-themes': ['@uiw/codemirror-themes-all'],
          // Highlight.js - split into separate chunk
          'highlight': ['highlight.js'],
          // KaTeX - split into separate chunk  
          'katex': ['katex', 'markdown-it-katex'],
          // Reveal.js - split into separate chunk
          'reveal': ['reveal.js'],
          // CodeMirror core
          'codemirror': [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/lang-markdown',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/autocomplete',
            '@codemirror/theme-one-dark'
          ],
          // Markdown-it and plugins
          'markdown-it': [
            'markdown-it',
            'markdown-it-anchor',
            'markdown-it-emoji',
            'markdown-it-mark',
            'markdown-it-sub',
            'markdown-it-sup',
            'markdown-it-ins',
            'markdown-it-container',
            'markdown-it-imsize',
            'markdown-it-task-lists',
            'markdown-it-footnote',
            'markdown-it-abbr'
          ]
        }
      }
    }
  }
})
