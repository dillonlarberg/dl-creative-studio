import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('[vite] REPLICATE_API_TOKEN loaded:', env.REPLICATE_API_TOKEN ? `${env.REPLICATE_API_TOKEN.slice(0, 6)}...` : 'MISSING')
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'https://us-central1-automated-creative-e10d7.cloudfunctions.net',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/replicate': {
          target: 'https://api.replicate.com/v1',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/replicate/, ''),
          headers: {
            Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
          },
        },
      },
    },
  }
})
