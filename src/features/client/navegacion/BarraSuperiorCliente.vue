<script setup>
import { computed } from 'vue'
import BrandLogo from '../../../components/BrandLogo.vue'

const props = defineProps({
  activePlan: { type: String, required: true },
  activeSection: { type: String, required: true },
  items: { type: Array, required: true },
  notificationCount: { type: Number, default: 0 },
  profileOpen: { type: Boolean, default: false },
  userFirstName: { type: String, required: true },
  userFullName: { type: String, default: '' },
})

defineEmits(['logout', 'navigate', 'toggle-profile'])

const resolvedProfileName = computed(() =>
  String(props.userFullName || props.userFirstName || 'Cliente privado').trim(),
)
const userInitial = computed(() =>
  resolvedProfileName.value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase(),
)
const profileLabel = computed(() => resolvedProfileName.value.toUpperCase())
</script>

<template>
  <header class="client-top-nav">
    <RouterLink class="client-brand" to="/cliente/reservar" aria-label="Red Aviation">
      <BrandLogo alt="Red Aviation" variant="dark" :width="132" />
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
        <span class="nav-label">{{ item.label.trim() }}</span>
      </button>
    </nav>

    <button class="mobile-reserve-button" type="button" @click="$emit('navigate', 'reservar')">
      <span aria-hidden="true">☰</span>
      Buscar
    </button>

    <div class="client-top-nav__actions">
      <button
        class="notification-button"
        type="button"
        aria-label="Notificaciones"
        @click="$emit('navigate', 'viajes')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3a5 5 0 0 0-5 5v2.1c0 .7-.24 1.37-.67 1.9L4.6 14.1A1 1 0 0 0 5.37 16h13.26a1 1 0 0 0 .77-1.9l-1.73-2.1a3 3 0 0 1-.67-1.9V8a5 5 0 0 0-5-5Zm0 18a3 3 0 0 0 2.83-2H9.17A3 3 0 0 0 12 21Z"
            fill="currentColor"
          />
        </svg>
        <span v-if="props.notificationCount > 0" class="notification-badge">
          {{ props.notificationCount }}
        </span>
      </button>

      <div class="profile-menu">
        <button class="profile-button" type="button" @click="$emit('toggle-profile')">
          <span>{{ userInitial }}</span>
          <strong>{{ profileLabel }}</strong>
          <svg class="profile-button__chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m7 10 5 5 5-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/>
          </svg>
        </button>

        <div v-if="profileOpen" class="profile-dropdown">
          <div class="profile-dropdown__header">
            <span class="profile-dropdown__avatar">{{ userInitial }}</span>
            <div class="profile-dropdown__identity">
              <strong>{{ profileLabel }}</strong>
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
  gap: 1.25rem;
  align-items: center;
  min-height: 4.25rem;
  padding: 0.75rem clamp(1.5rem, 4vw, 2.6rem);
  border-bottom: 1px solid rgba(229, 225, 216, 0.8);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(18px);
}

.client-top-nav__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
}

.client-brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
}

.client-main-nav {
  display: flex;
  justify-content: center;
  gap: 1rem;
}

.client-main-nav button,
.profile-button,
.profile-dropdown button {
  min-height: 3rem;
  border: 0;
  border-radius: 16px;
  padding: 0 1.15rem;
  background: transparent;
  color: #26231f;
  font-weight: 800;
  cursor: pointer;
}

.client-main-nav button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.62rem;
  font-size: 0.94rem;
  letter-spacing: -0.01em;
}

.nav-icon {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

.nav-label {
  display: inline-flex;
  align-items: center;
}

.nav-icon svg {
  width: 100%;
  height: 100%;
}

.client-main-nav button.active,
.client-main-nav button:hover {
  background: #111111;
  color: #ffffff;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.14);
}

.client-main-nav button.active .nav-label,
.client-main-nav button.active .nav-icon,
.client-main-nav button.active .nav-icon svg,
.client-main-nav button:hover .nav-label,
.client-main-nav button:hover .nav-icon,
.client-main-nav button:hover .nav-icon svg {
  color: #ffffff;
}

.profile-menu {
  position: relative;
}

.mobile-reserve-button {
  display: none;
}

.notification-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #2a2622;
  cursor: pointer;
}

.notification-button svg {
  width: clamp(1.45rem, 1.1vw + 1rem, 1.7rem);
  height: clamp(1.45rem, 1.1vw + 1rem, 1.7rem);
}

.notification-badge {
  position: absolute;
  top: 0.1rem;
  right: 0.15rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.2rem;
  border-radius: 999px;
  background: #b8862d;
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1;
}

.profile-button {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  max-width: 20rem;
  min-height: 3.25rem;
  padding: 0.45rem 1.1rem 0.45rem 0.85rem;
  border: 1px solid rgba(229, 225, 216, 0.95);
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff, #fcfaf6);
  box-shadow: 0 10px 26px rgba(17, 17, 17, 0.06);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease;
}

.profile-button span {
  flex: 0 0 auto;
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  place-items: center;
  border-radius: 999px;
  background: #111111;
  color: #ffffff;
  font-size: 0.92rem;
  font-weight: 900;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.profile-button strong {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #2b2723;
  font-size: 0.9rem;
  font-weight: 900;
  letter-spacing: -0.01em;
}

.profile-button:hover {
  transform: translateY(-1px);
  border-color: rgba(214, 201, 175, 0.95);
  box-shadow: 0 14px 30px rgba(17, 17, 17, 0.08);
}

.profile-button__chevron {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
  color: #5f5b54;
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + 0.55rem);
  right: 0;
  display: grid;
  gap: 1rem;
  width: min(30rem, calc(100vw - 2rem));
  min-width: 20rem;
  padding: 1.25rem;
  border: 1px solid rgba(231, 222, 205, 0.96);
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(243, 234, 210, 0.75), transparent 34%),
    linear-gradient(180deg, #ffffff, #fbf8f2);
  box-shadow: 0 28px 60px rgba(17, 17, 17, 0.16);
}

.profile-dropdown__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.15rem;
}

.profile-dropdown__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.7rem;
  height: 3.7rem;
  border-radius: 999px;
  background: #111111;
  color: #ffffff;
  font-size: 1.35rem;
  font-weight: 900;
  box-shadow: 0 14px 28px rgba(17, 17, 17, 0.14);
}

.profile-dropdown__identity {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
  flex: 1 1 auto;
}

.profile-dropdown__identity strong {
  color: #1a1a1a;
  font-size: 1.15rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}

.profile-dropdown__identity small {
  color: #85796a;
  font-size: 0.88rem;
  font-weight: 800;
}

.profile-dropdown__status {
  padding: 0;
}

.profile-dropdown__status span {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 3rem;
  width: 100%;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  background: linear-gradient(180deg, #f6ebca, #f2e1a6);
  color: #8b6a24;
  font-size: 0.84rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  box-sizing: border-box;
}

.profile-dropdown__status svg {
  width: 1rem;
  height: 1rem;
  flex: 0 0 auto;
}

.profile-dropdown__actions {
  display: grid;
  gap: 0.8rem;
}

.profile-dropdown__actions button {
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 4.2rem;
  justify-content: flex-start;
  border-radius: 24px;
  text-align: left;
  padding: 0 1.4rem;
  font-size: 0.95rem;
  font-weight: 900;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    background 160ms ease;
}

.profile-dropdown__actions button svg {
  width: 1.15rem;
  height: 1.15rem;
  flex: 0 0 auto;
}

.profile-dropdown__actions button:not(.logout-option) {
  background: linear-gradient(180deg, #f5efe2, #efe7d8);
  color: #24211c;
}

.profile-dropdown__actions .logout-option {
  color: #ab2a2a;
  background: linear-gradient(180deg, #fff2ef, #fde9e5);
}

.profile-dropdown__actions button:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(17, 17, 17, 0.08);
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

  .client-top-nav__actions {
    gap: 0.45rem;
  }

  .notification-button {
    width: 2.2rem;
    height: 2.2rem;
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
    min-height: 2.35rem;
    padding: 0 0.35rem 0 0.3rem;
    border-radius: 999px;
    background: transparent;
    box-shadow: none;
    border: 0;
  }

  .profile-button span {
    width: 1.95rem;
    height: 1.95rem;
  }

  .profile-button strong {
    display: none;
  }

  .profile-button__chevron {
    display: none;
  }

  .profile-dropdown {
    right: 0;
    width: min(18rem, calc(100vw - 1.3rem));
    min-width: 0;
    padding: 0.9rem;
    border-radius: 24px;
  }
}
</style>
