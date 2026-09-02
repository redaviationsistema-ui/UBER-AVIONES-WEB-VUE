import { fileURLToPath, URL } from 'node:url'

import { createLogger, defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const viteLogger = createLogger()
const suppressedLocalApiProxyErrorPattern = /http proxy error: \/api(?:\/|$)/i
const suppressedConnectionRefusedPattern = /econnrefused\s+127\.0\.0\.1:8000/i

const customLogger = {
  ...viteLogger,
  error(msg, options) {
    const normalizedMessage = String(msg || '')
    const normalizedStack = String(options?.error?.stack || options?.error?.message || '')
    const errorPayload = `${normalizedMessage}\n${normalizedStack}`

    if (
      suppressedLocalApiProxyErrorPattern.test(normalizedMessage) &&
      suppressedConnectionRefusedPattern.test(errorPayload)
    ) {
      return
    }

    viteLogger.error(msg, options)
  },
}

function safeOrigin(value) {
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appBase = String(env.VITE_APP_BASE_PATH || '/').trim() || '/'
  const normalizedBase = appBase.endsWith('/') ? appBase : `${appBase}/`
  const apiBaseUrl = String(
    env.VITE_API_URL || env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1',
  ).trim()
  const backendOrigin = String(env.VITE_BACKEND_ORIGIN || '').trim()
  const proxyTarget = backendOrigin || safeOrigin(apiBaseUrl) || 'http://127.0.0.1:8000'

  return {
    base: normalizedBase,
    customLogger,
    plugins: [
      vue(),
      vueDevTools(),
    ],
    server: {
      host: 'localhost',
      proxy: {
        '/api': {
          target: proxyTarget,
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
