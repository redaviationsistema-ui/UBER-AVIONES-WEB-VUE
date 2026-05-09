<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import LandingPage from '../components/LandingPage.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const shouldRenderPublicHome = computed(() => !auth.isAuthenticated)

if (auth.isAuthenticated) {
  router.replace(auth.dashboardPath)
}
</script>

<template>
  <div v-if="shouldRenderPublicHome" class="home-page">
    <LandingPage />
    <SiteFooter />
  </div>
</template>

<style scoped>
.home-page {
  background: #ffffff;
  color: #111111;
}

.role-entry {
  padding: clamp(3rem, 7vw, 6rem) clamp(1.2rem, 5vw, 4.5rem);
  background: linear-gradient(180deg, #ece7de 0%, #f3efe8 100%);
}

.section-head {
  margin-bottom: 1.2rem;
}

h2 {
  max-width: 760px;
  margin-bottom: 0;
  color: #111111;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: clamp(1.7rem, 4vw, 3rem);
  line-height: 1.02;
}

.role-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.role-card {
  display: grid;
  gap: 0.85rem;
  border: 1px solid rgba(16, 17, 20, 0.08);
  border-radius: 24px;
  padding: 1.4rem;
  color: #111111;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.86);
  box-shadow:
    0 24px 60px rgba(19, 27, 38, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
  transition: transform 180ms ease, box-shadow 180ms ease;
}

.role-card p {
  margin: 0;
  color: #4a4a4a;
}

.role-card strong {
  color: #111111;
}

.role-card:hover {
  transform: translateY(-4px);
}

@media (max-width: 1080px) {
  .role-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .role-grid {
    grid-template-columns: 1fr;
  }
}
</style>
