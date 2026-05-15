import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@agencypmg/alli-design-system'],
  },
  build: {
    commonjsOptions: {
      include: [/alli-frontend-design-system/, /node_modules/],
      transformMixedEsModules: true,
      defaultIsModuleExports: 'auto',
      requireReturnsDefault: 'auto',
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://us-central1-automated-creative-e10d7.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
