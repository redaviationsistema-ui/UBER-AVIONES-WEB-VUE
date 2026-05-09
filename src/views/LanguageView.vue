<script setup>
import BrandLogo from '../components/BrandLogo.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

function setLanguage(language) {
  router.push({ path: '/membresias', query: { lang: language } })
}
</script>

<template>
  <main class="language-page">
    <header class="language-header">
      <RouterLink to="/" class="brand" aria-label="Sky Group">
        <BrandLogo variant="light" width="154px" />
      </RouterLink>

      <nav class="header-links">
        <RouterLink to="/plataforma">Descripción general</RouterLink>
        <RouterLink to="/servicios">Soluciones</RouterLink>
        <RouterLink to="/membresias">Precios</RouterLink>
        <RouterLink to="/ayuda">Soporte al usuario</RouterLink>
        <RouterLink to="/membresias/contacto">Contáctanos</RouterLink>
        <RouterLink to="/login">Inicia sesión</RouterLink>
        <RouterLink to="/membresias/comenzar" class="start-btn">Comenzar</RouterLink>
      </nav>
    </header>

    <section class="language-content">
      <RouterLink to="/membresias" class="close-btn">×</RouterLink>

      <h1>Seleccionar mi idioma preferido</h1>

      <div class="language-options">
        <button type="button" @click="setLanguage('en')">
          English
        </button>

        <button type="button" @click="setLanguage('es')">
          Español 
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.language-page {
  min-height: 100vh;
  background: #fff;
  color: #000;
}

.language-header {
  height: 76px;
  display: flex;
  align-items: center;
  gap: 2.5rem;
  padding: 0 5rem;
  background: #000;
  color: #fff;
}

.brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.header-links {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1.6rem;
}

.header-links a {
  color: white;
  font-size: 0.92rem;
  font-weight: 800;
  text-decoration: none;
}

.start-btn {
  padding: 0.7rem 1.1rem;
  border-radius: 999px;
  background: white;
  color: black !important;
}

.language-content {
  position: relative;
  min-height: calc(100vh - 76px);
  padding: 7rem 8%;
}

.close-btn {
  position: absolute;
  top: 5rem;
  right: 8%;
  color: #000;
  font-size: 4rem;
  font-weight: 900;
  line-height: 1;
  text-decoration: none;
}

.language-content h1 {
  margin: 0 0 6rem;
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 1;
  letter-spacing: -0.05em;
}

.language-options {
  display: grid;
  grid-template-columns: repeat(2, 260px);
  gap: 6rem;
}

.language-options button {
  border: 0;
  background: transparent;
  color: #000;
  font-size: 1.3rem;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.language-options button:hover {
  text-decoration: underline;
}

@media (max-width: 900px) {
  .language-header {
    padding: 0 1.2rem;
  }

  .header-links {
    display: none;
  }

  .language-content {
    padding: 5rem 1.4rem;
  }

  .close-btn {
    top: 2rem;
    right: 1.4rem;
    font-size: 3rem;
  }

  .language-options {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
}
</style>
