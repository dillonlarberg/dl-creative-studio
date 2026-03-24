import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function packageChunkName(id: string) {
  const [, modulePath] = id.split('node_modules/')
  if (!modulePath) return 'vendor'
  const segments = modulePath.split('/')
  const packageName = segments[0].startsWith('@')
    ? `${segments[0]}-${segments[1]}`
    : segments[0]
  return `vendor-${packageName.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.log('[vite] REPLICATE_API_TOKEN loaded:', env.REPLICATE_API_TOKEN ? `${env.REPLICATE_API_TOKEN.slice(0, 6)}...` : 'MISSING')
  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router') || id.includes('/node_modules/scheduler/')) {
              return 'vendor-react'
            }
            if (id.includes('/node_modules/firebase/')) {
              return 'vendor-firebase'
            }
            if (id.includes('/node_modules/@firebase/') || id.includes('/node_modules/idb/') || id.includes('/node_modules/cookie/') || id.includes('/node_modules/set-cookie-parser/')) {
              return 'vendor-firebase'
            }
            if (id.includes('/node_modules/fabric/')) {
              return 'vendor-fabric'
            }
            if (
              id.includes('/node_modules/@headlessui/') ||
              id.includes('/node_modules/@heroicons/') ||
              id.includes('/node_modules/@floating-ui/') ||
              id.includes('/node_modules/@react-aria/') ||
              id.includes('/node_modules/@react-stately/') ||
              id.includes('/node_modules/@tanstack/') ||
              id.includes('/node_modules/tabbable/')
            ) {
              return 'vendor-ui'
            }
            if (id.includes('/node_modules/@swc/helpers/')) {
              return 'vendor-react'
            }
            return packageChunkName(id)
          },
        },
      },
    },
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
