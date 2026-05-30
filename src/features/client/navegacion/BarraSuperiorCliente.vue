<script setup>
import BrandLogo from '../../../components/BrandLogo.vue'

defineProps({
  activePlan: { type: String, required: true },
  activeSection: { type: String, required: true },
  items: { type: Array, required: true },
  profileOpen: { type: Boolean, default: false },
  userFirstName: { type: String, required: true },
})

defineEmits(['logout', 'navigate', 'toggle-profile'])
</script>

<template>
  <header class="client-top-nav">
    <RouterLink class="client-brand" to="/cliente/reservar" aria-label="Red Aviation">
      <BrandLogo alt="Red Aviation" variant="dark" :width="148" />
    </RouterLink>

    <nav class="client-main-nav" aria-label="Navegacion cliente">
      <button
        v-for="item in items"
        :key="item.section"
        type="button"
        :class="{ active: activeSection === item.section }"
        @click="$emit('navigate', item.section)"
      >
        {{ item.label }}
      </button>
    </nav>

    <button class="mobile-reserve-button" type="button" @click="$emit('navigate', 'reservar')">
      <span aria-hidden="true">☰</span>
      Buscar
    </button>

    <div class="profile-menu">
      <button class="profile-button" type="button" @click="$emit('toggle-profile')">
        <span>{{ userFirstName.slice(0, 1).toUpperCase() }}</span>
        <strong>{{ userFirstName }}</strong>
      </button>

      <div v-if="profileOpen" class="profile-dropdown">
        <span>{{ activePlan }}</span>
        <button type="button" @click="$emit('navigate', 'perfil')">Perfil</button>
        <button class="logout-option" type="button" @click="$emit('logout')">Cerrar sesion</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.client-top-nav {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: center;
  min-height: 4.7rem;
  padding: 0.8rem clamp(1rem, 4vw, 2rem);
  border-bottom: 1px solid #e5e1d8;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
}

.client-brand {
  display: inline-flex;
  min-width: 0;
}

.client-main-nav {
  display: flex;
  justify-content: center;
  gap: 0.45rem;
}

.client-main-nav button,
.profile-button,
.profile-dropdown button {
  min-height: 2.65rem;
  border: 0;
  border-radius: 8px;
  padding: 0 0.95rem;
  background: transparent;
  color: #1f1f1f;
  font-weight: 800;
  cursor: pointer;
}

.client-main-nav button.active,
.client-main-nav button:hover {
  background: #111111;
  color: #ffffff;
}

.profile-menu {
  position: relative;
}

.mobile-reserve-button {
  display: none;
}

.profile-button {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  max-width: 12rem;
  background: #f2eee5;
}

.profile-button span {
  flex: 0 0 auto;
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 999px;
  background: #111111;
  color: #ffffff;
}

.profile-button strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  display: grid;
  gap: 0.35rem;
  min-width: 190px;
  padding: 0.75rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.12);
}

.profile-dropdown span {
  color: #8b6a24;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.profile-dropdown button {
  text-align: left;
  background: #f4f0e7;
}

.profile-dropdown .logout-option {
  color: #8f1f1f;
  background: #fff0ed;
}

@media (max-width: 760px) {
  .client-top-nav {
    grid-template-columns: minmax(0, 1fr) auto auto;
    min-height: 3.8rem;
    padding: 0.45rem 0.65rem;
  }

  .client-main-nav {
    display: none;
  }

  .mobile-reserve-button {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    justify-content: center;
    min-height: 2.1rem;
    border: 1px solid #dedbd2;
    border-radius: 999px;
    padding: 0 0.72rem;
    background: #111111;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .client-brand :deep(img),
  .client-brand :deep(svg) {
    max-width: 98px;
    height: auto;
  }

  .profile-button {
    max-width: none;
    min-height: 2.1rem;
    padding: 0 0.35rem 0 0.3rem;
    border-radius: 999px;
    background: transparent;
  }

  .profile-button span {
    width: 1.95rem;
    height: 1.95rem;
  }

  .profile-button strong {
    display: none;
  }

  .profile-dropdown {
    right: 0;
    width: min(12rem, calc(100vw - 1.3rem));
    min-width: 0;
  }
}
</style>
