import { defineConfig } from 'vite'
import veaury from 'veaury/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    veaury({
      type: 'vue',
      // Include @excalidraw packages for React processing
    })
  ],
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
      '/whiteboard': {
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
          // Note: CodeMirror themes are now imported individually and will be split automatically
          // Highlight.js - split into separate chunk
          'highlight': ['highlight.js'],
          // KaTeX - split into separate chunk  
          'katex': ['katex', '@mdit/plugin-katex'],
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
          ],
          // Excalidraw + React (loaded dynamically for whiteboard)
          'excalidraw': ['@excalidraw/excalidraw', 'react', 'react-dom']
        }
      }
    }
  }
})
