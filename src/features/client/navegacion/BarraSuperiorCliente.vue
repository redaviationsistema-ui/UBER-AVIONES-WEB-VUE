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
        <span class="nav-icon" aria-hidden="true">
          <svg v-if="item.section === 'reservar'" viewBox="0 0 24 24">
            <path
              d="M21 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"
              fill="currentColor"
            />
          </svg>
          <svg v-else-if="item.section === 'viajes'" viewBox="0 0 24 24">
            <path
              d="M7 4h10a2 2 0 0 1 2 2v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm0 3v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7H7Zm2 2h6v2H9V9Zm0 4h4v2H9v-2Z"
              fill="currentColor"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <path
              d="M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.418 0 8 2.239 8 5v1H4v-1c0-2.761 3.582-5 8-5Z"
              fill="currentColor"
            />
          </svg>
        </span>
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
        <div class="profile-dropdown__header">
          <span class="profile-dropdown__avatar">{{ userFirstName.slice(0, 1).toUpperCase() }}</span>
          <div class="profile-dropdown__identity">
            <strong>{{ userFirstName }}</strong>
            <small>Cuenta cliente</small>
          </div>
        </div>

        <div class="profile-dropdown__status">
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 13.6L7.6 12.4l1.4-1.4 1.8 1.8 4.2-4.2 1.4 1.4-5.6 5.6Z"
                fill="currentColor"
              />
            </svg>
            {{ activePlan }}
          </span>
        </div>

        <div class="profile-dropdown__actions">
          <button type="button" @click="$emit('navigate', 'perfil')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.418 0 8 2.239 8 5v1H4v-1c0-2.761 3.582-5 8-5Z"
                fill="currentColor"
              />
            </svg>
            <span>Ver perfil</span>
          </button>
          <button class="logout-option" type="button" @click="$emit('logout')">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10v-2H6V6h4V4Zm4.6 3.4L13.2 8.8l1.8 1.7H9v2h6l-1.8 1.7 1.4 1.4L19 11l-4.4-4.4Z"
                fill="currentColor"
              />
            </svg>
            <span>Cerrar sesion</span>
          </button>
        </div>
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

.nav-icon {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  margin-right: 0.42rem;
  vertical-align: -0.12rem;
}

.nav-icon svg {
  width: 100%;
  height: 100%;
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
  gap: 0.8rem;
  min-width: 250px;
  padding: 0.9rem;
  border: 1px solid #e7decd;
  border-radius: 22px;
  background: linear-gradient(180deg, #ffffff, #fbf8f2);
  box-shadow: 0 24px 52px rgba(17, 17, 17, 0.14);
}

.profile-dropdown__header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.35rem;
}

.profile-dropdown__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 999px;
  background: #111111;
  color: #ffffff;
  font-size: 1.2rem;
  font-weight: 900;
}

.profile-dropdown__identity {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}

.profile-dropdown__identity strong {
  color: #1a1a1a;
  font-size: 1.05rem;
  line-height: 1.15;
}

.profile-dropdown__identity small {
  color: #746b5d;
  font-size: 0.82rem;
  font-weight: 700;
}

.profile-dropdown__status {
  padding: 0 0.35rem;
}

.profile-dropdown__status span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2rem;
  padding: 0 0.82rem;
  border-radius: 999px;
  background: #f3ead2;
  color: #8b6a24;
  font-size: 0.76rem;
  font-weight: 900;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.profile-dropdown__status svg {
  width: 0.95rem;
  height: 0.95rem;
  flex: 0 0 auto;
}

.profile-dropdown__actions {
  display: grid;
  gap: 0.55rem;
}

.profile-dropdown__actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-height: 3.1rem;
  justify-content: flex-start;
  border-radius: 18px;
  text-align: left;
}

.profile-dropdown__actions button svg {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

.profile-dropdown__actions button:not(.logout-option) {
  background: #f4efe4;
  color: #111111;
}

.profile-dropdown__actions .logout-option {
  color: #9e2323;
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
    width: min(15.5rem, calc(100vw - 1.3rem));
    min-width: 0;
    padding: 0.75rem;
  }
}
</style>
