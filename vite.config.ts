import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  cacheDir: process.env.NODE_ENV === 'test' ? 'tmp/vite-test' : 'node_modules/.vite',
  optimizeDeps: { entries: ['resources/js/app.js'] },
  server: {
    watch: { ignored: ['**/.tools/**', '**/tmp/**', '**/build/**', '**/public/content/**'] },
  },
  plugins: [
    tailwindcss(),
    adonisjs({
      /**
       * Entrypoints of your application. Each entrypoint will
       * result in a separate bundle.
       */
      entrypoints: ['resources/css/app.css', 'resources/css/admin.css', 'resources/js/app.js'],

      /**
       * Paths to watch and reload the browser on file change
       */
      reload: ['resources/views/**/*.edge'],
    }),
  ],
})
