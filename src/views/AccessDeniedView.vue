<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const reasonMessage = computed(() => {
  const reason = String(route.query.reason || '').trim()

  if (reason === 'admin-role-required') {
    return 'Esta vista requiere un rol administrador validado por backend.'
  }

  if (reason === 'route-policy') {
    return 'La ruta solicitada no tiene una politica de acceso valida.'
  }

  if (reason === 'auth-validation-failed') {
    return 'No fue posible validar la sesion administrativa contra el backend. El acceso queda bloqueado por seguridad.'
  }

  return 'No tienes permisos suficientes para entrar a esta seccion.'
})
</script>

<template>
  <main class="access-denied">
    <section class="access-denied__card">
      <p class="access-denied__eyebrow">Acceso denegado</p>
      <h1>La sesion no cuenta con permisos para continuar.</h1>
      <p>{{ reasonMessage }}</p>
      <RouterLink class="access-denied__link" to="/">Volver al inicio</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.access-denied {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(circle at top, rgba(173, 216, 230, 0.28), transparent 42%),
    linear-gradient(180deg, #f3f6fb 0%, #dfe7f0 100%);
}

.access-denied__card {
  width: min(100%, 560px);
  padding: 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.14);
  color: #16324f;
}

.access-denied__eyebrow {
  margin: 0 0 12px;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7c2d12;
}

h1 {
  margin: 0 0 12px;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  line-height: 1.1;
}

p {
  margin: 0;
  line-height: 1.6;
}

.access-denied__link {
  display: inline-flex;
  margin-top: 24px;
  color: #0f4c81;
  font-weight: 600;
  text-decoration: none;
}
</style>
