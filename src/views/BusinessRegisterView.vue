<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const identifier = ref('')

function continueFlow(source = 'direct') {
  router.push({
    name: 'membresias-contacto',
    query: {
      identifier: identifier.value,
      source,
    },
  })
}
</script>

<template>
  <main class="register-page">
    <header class="simple-header">
      <RouterLink to="/" class="brand">Sky Group Business</RouterLink>
    </header>

    <section class="register-box">
      <h1>¿Cuál es tu teléfono o correo electrónico?</h1>

      <input v-model="identifier" type="text" placeholder="Ingresa tu teléfono o correo electrónico" />

      <button type="button" @click="continueFlow()">Continuar</button>

      <div class="divider">
        <span></span>
        <small>o</small>
        <span></span>
      </div>

      <button type="button" class="social" @click="continueFlow('google')">Continúa con Google</button>
      <button type="button" class="social" @click="continueFlow('apple')">Continúa con Apple</button>

      <p>
        Al continuar, aceptas recibir información sobre vuelos privados, membresías, paquetes
        corporativos y servicios de Sky Group.
      </p>
    </section>
  </main>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  background: #fff;
  color: #000;
}

.simple-header {
  height: 72px;
  display: flex;
  align-items: center;
  padding: 0 7%;
  background: #000;
}

.brand {
  color: #fff;
  font-size: 1.4rem;
  font-weight: 800;
  text-decoration: none;
}

.register-box {
  width: 100%;
  max-width: 420px;
  margin: 7rem auto;
  padding: 0 1rem;
}

.register-box h1 {
  font-size: 2rem;
  line-height: 1.1;
  margin-bottom: 1rem;
}

input {
  width: 100%;
  height: 52px;
  padding: 0 1rem;
  border: 2px solid #000;
  border-radius: 8px;
  font-size: 1rem;
}

button {
  width: 100%;
  height: 52px;
  margin-top: 1rem;
  border: 0;
  border-radius: 8px;
  background: #000;
  color: #fff;
  font-weight: 800;
  cursor: pointer;
}

.social {
  background: #e9e9e9;
  color: #000;
}

.divider {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
  margin: 1.6rem 0 0.5rem;
}

.divider span {
  height: 1px;
  background: #999;
}

.register-box p {
  margin-top: 3rem;
  color: #555;
  font-size: 0.85rem;
  line-height: 1.6;
}
</style>
