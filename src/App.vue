<template>
  <main :class="['app-shell', { 'app-shell-light': usesLightShell }]">
    <div v-if="shouldHoldInitialRender" class="app-boot-guard" aria-live="polite">
      <div class="app-boot-card">
        <div class="app-boot-mark">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <p class="app-boot-title">Recuperando tu sesion</p>
        <p class="app-boot-copy">Entrando al portal seguro de Sky Group...</p>
      </div>
    </div>
    <template v-else>
      <TopNav v-if="showsTopNav" />
      <RouterView />
    </template>
    <ToastStack />
  </main>
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import TopNav from './components/TopNav.vue'
import ToastStack from './components/ToastStack.vue'
import { useAuthStore } from './stores/auth'

const route = useRoute()
const auth = useAuthStore()
const showsTopNav = computed(() => !route.meta.hideTopbar)
const usesLightShell = computed(() =>
  ['servicios', 'plataforma', 'cliente', 'cliente-detalle', 'cliente-subdetalle', 'operador', 'crew'].includes(
    String(route.name || ''),
  ),
)
const shouldHoldInitialRender = computed(
  () =>
    auth.sessionState === 'initializing' &&
    Boolean(route.meta.requiresAuth || route.meta.guestOnly || route.meta.redirectAuthenticated),
)

watchEffect(() => {
  document.body.classList.toggle('body-light-route', usesLightShell.value)
})
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --bg-base: #07090d;
  --bg-elevated: rgba(13, 18, 27, 0.82);
  --bg-soft: rgba(255, 255, 255, 0.045);
  --text-primary: #f6f1e8;
  --text-secondary: #aeb6c4;
  --line-soft: rgba(255, 255, 255, 0.09);
  --gold-1: #f2d88d;
  --gold-2: #bf8f2e;
  --green-1: #9af1c8;
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(circle at top, rgba(216, 180, 91, 0.08), transparent 28%),
    linear-gradient(180deg, #090c12, #05070b 48%, #04060a);
  color: var(--text-primary);
  font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
}

body.body-light-route {
  background: #ffffff;
  color: #111111;
}

button,
input,
select,
textarea {
  font: inherit;
}

a {
  color: inherit;
}

button {
  cursor: pointer;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

.app-shell {
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(216, 180, 91, 0.08), transparent 22%),
    linear-gradient(135deg, rgba(10, 14, 22, 0.98), rgba(8, 10, 15, 0.98)),
    var(--bg-base);
}

.app-shell-light {
  background: #ffffff;
}

.app-boot-guard {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 2rem;
}

.app-boot-card {
  width: min(100%, 24rem);
  display: grid;
  gap: 0.85rem;
  justify-items: center;
  padding: 2rem 1.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  background:
    radial-gradient(circle at top, rgba(216, 180, 91, 0.12), transparent 55%),
    rgba(8, 10, 15, 0.9);
  box-shadow:
    0 26px 80px rgba(0, 0, 0, 0.38),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  text-align: center;
}

.app-shell-light .app-boot-card {
  border-color: rgba(17, 17, 17, 0.08);
  background:
    radial-gradient(circle at top, rgba(216, 180, 91, 0.14), transparent 55%),
    rgba(255, 255, 255, 0.96);
  box-shadow:
    0 24px 70px rgba(19, 27, 38, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.75);
}

.app-boot-mark {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  justify-content: center;
  min-height: 2.4rem;
}

.app-boot-mark span {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--gold-1), var(--gold-2));
  box-shadow: 0 0 18px rgba(216, 180, 91, 0.28);
  animation: bootPulse 1.1s ease-in-out infinite;
}

.app-boot-mark span:nth-child(2) {
  animation-delay: 0.15s;
}

.app-boot-mark span:nth-child(3) {
  animation-delay: 0.3s;
}

.app-boot-title,
.app-boot-copy {
  margin: 0;
}

.app-boot-title {
  color: var(--text-primary);
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1.05rem;
  font-weight: 800;
}

.app-shell-light .app-boot-title {
  color: #111111;
}

.app-boot-copy {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.app-shell-light .app-boot-copy {
  color: #5f6673;
}

@keyframes bootPulse {
  0%,
  80%,
  100% {
    transform: translateY(0) scale(0.92);
    opacity: 0.45;
  }

  40% {
    transform: translateY(-0.2rem) scale(1);
    opacity: 1;
  }
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: var(--gold-1);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.primary-action,
.secondary-action,
.ghost-button,
.icon-button {
  display: inline-flex;
  min-height: 2.8rem;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  border: 1px solid transparent;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;
}

.primary-action {
  padding: 0.8rem 1.2rem;
  color: #101318;
  background: linear-gradient(135deg, var(--gold-1), var(--gold-2));
  box-shadow: 0 18px 44px rgba(216, 180, 91, 0.22);
}

.secondary-action,
.ghost-button,
.icon-button {
  padding: 0.74rem 1rem;
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.055);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.primary-action:hover,
.secondary-action:hover,
.ghost-button:hover,
.icon-button:hover {
  transform: translateY(-2px);
  border-color: rgba(216, 180, 91, 0.45);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
}

.badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid rgba(216, 180, 91, 0.24);
  border-radius: 999px;
  padding: 0.28rem 0.62rem;
  color: var(--gold-1);
  background: rgba(216, 180, 91, 0.1);
  font-size: 0.75rem;
  font-weight: 800;
}

.badge.success {
  color: var(--green-1);
  border-color: rgba(101, 212, 160, 0.28);
  background: rgba(101, 212, 160, 0.1);
}

.badge.warning {
  color: #ffd58a;
  border-color: rgba(255, 213, 138, 0.28);
  background: rgba(255, 213, 138, 0.1);
}

.badge.danger {
  color: #ffaaa8;
  border-color: rgba(255, 111, 105, 0.28);
  background: rgba(255, 111, 105, 0.1);
}

.surface {
  border: 1px solid var(--line-soft);
  border-radius: 18px;
  background: var(--bg-elevated);
  box-shadow:
    0 22px 70px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
}

.muted {
  color: var(--text-secondary);
}

@media (max-width: 760px) {
  .primary-action,
  .secondary-action,
  .ghost-button {
    width: 100%;
  }
}
</style>
