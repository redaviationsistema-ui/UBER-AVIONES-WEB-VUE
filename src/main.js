import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(pinia)
const auth = useAuthStore(pinia)

try {
  await auth.initialize()
} catch {
  // The router and guarded views will resolve the best local auth state available.
}

app.use(router)

await router.isReady()

app.mount('#app')
