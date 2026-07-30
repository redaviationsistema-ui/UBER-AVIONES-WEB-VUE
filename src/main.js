import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import { useAuthStore } from './stores/auth'

//console.log('[Bootstrap] main.js iniciado')

const app = createApp(App)

try {
  app.use(pinia)
  //console.log('[Bootstrap] Pinia registrado')

  app.use(router)
  //console.log('[Bootstrap] Router registrado')

  const auth = useAuthStore(pinia)

  try {
    await auth.initialize()
  } catch (error) {
    //console.error('[Bootstrap] Error durante auth.initialize()', error)
  }
 
  //console.log('[Bootstrap] Auth inicializado')


  //console.log('[Bootstrap] Antes de mount')
  app.mount('#app')
  //console.log('[Bootstrap] Vue montado')

  router.isReady()
    .then(() => {
    //  console.log('[Bootstrap] Router listo')
    })
    .catch((error) => {
      //console.error('[Bootstrap] Error durante router.isReady()', error)
    })
} catch (error) {
 // console.error('[Bootstrap] Error durante el bootstrap', error)
}
