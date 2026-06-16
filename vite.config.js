import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appBase = String(env.VITE_APP_BASE_PATH || '/').trim() || '/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`

  return {
    base: normalizedBase,
    plugins: [
      vue(),
      basicSsl(),
      vueDevTools(),
    ],
    server: {
      host: 'localhost',
      https: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
