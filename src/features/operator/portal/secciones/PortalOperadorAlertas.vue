<template>
  <div class="operator-bell">
    <button ref="trigger" type="button" class="operator-bell__button"
      aria-label="Abrir notificaciones" :aria-expanded="realtimeNotificationsOpen"
      :aria-controls="drawerId" aria-haspopup="dialog" @click="toggleDrawer">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
      <span v-if="unreadRealtimeNotifications > 0" class="operator-bell__badge">{{ unreadRealtimeNotifications > 99 ? '99+' : unreadRealtimeNotifications }}</span>
    </button>
    <Teleport to="body">
      <Transition name="operator-notice">
        <section v-if="realtimeNotificationsOpen" :id="drawerId" ref="panel" class="operator-notice"
          :style="panelPosition" role="dialog" aria-label="Notificaciones" tabindex="-1">
          <header class="operator-notice__header">
            <h2>Notificaciones</h2>
            <button type="button" :disabled="!unreadRealtimeNotifications" @click="markAllRealtimeNotificationsRead">Marcar todas como leídas</button>
          </header>
          <div class="operator-notice__list">
            <article v-for="notification in recentNotifications" :key="notification.id"
              class="operator-notice__row" :class="{ 'is-unread': !notification.readAt, 'is-read': notification.readAt, 'is-confirmed': notification.type === 'flight.confirmed' }">
              <button type="button" class="operator-notice__open" @click="openNotice(notification)">
                <span class="operator-notice__icon" aria-hidden="true">✈</span>
                <span class="operator-notice__copy">
                  <span class="operator-notice__title">{{ notification.title }}</span>
                  <span class="operator-notice__route">{{ notification.payload?.route || 'Ruta por confirmar' }}</span>
                  <span class="operator-notice__aircraft">Solicitud #{{ notification.requestId }}<template v-if="aircraftName(notification)"> · {{ aircraftName(notification) }}</template></span>
                  <time :datetime="notification.createdAt">{{ noticeTime(notification.createdAt) }}</time>
                </span>
                <span class="operator-notice__status">{{ notification.readAt ? 'Leída' : notification.type === 'flight.confirmed' ? 'Confirmado' : 'Nueva' }}</span>
              </button>
              <button v-if="!notification.readAt" type="button" class="operator-notice__read"
                :aria-label="`Marcar solicitud ${notification.requestId} como leída`" @click="markRealtimeNotificationRead(notification.id)">Marcar leída</button>
            </article>
            <p v-if="!activeRealtimeNotifications.length" class="operator-notice__empty">No hay notificaciones para mostrar.</p>
          </div>
          <footer class="operator-notice__footer">
            <button type="button" @click="viewAll">Ver todas las notificaciones →</button>
            <button type="button" @click="enableBrowserNotifications">Activar avisos del navegador</button>
          </footer>
        </section>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useInjectedOperatorPortalContext } from './useInjectedOperatorPortalContext'

const {
  realtimeNotificationsOpen, unreadRealtimeNotifications, activeRealtimeNotifications,
  markAllRealtimeNotificationsRead, markRealtimeNotificationRead, openRealtimeNotification,
  enableBrowserNotifications, goToSection,
} = useInjectedOperatorPortalContext()
const trigger = ref(null)
const panel = ref(null)
const drawerId = `operator-notifications-${useId()}`
const panelPosition = ref({})
const recentNotifications = computed(() => activeRealtimeNotifications.value.slice(0, 6))

function positionPanel() {
  const bounds = trigger.value?.getBoundingClientRect()
  if (!bounds) return
  const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 100))
  panelPosition.value = {
    top: `${top}px`,
    right: `${window.innerWidth <= 600 ? 12 : Math.max(12, window.innerWidth - bounds.right)}px`,
    maxHeight: `${Math.max(80, Math.min(460, window.innerHeight - top - 12))}px`,
  }
}
function closeDrawer(restoreFocus = false) {
  realtimeNotificationsOpen.value = false
  if (restoreFocus) trigger.value?.focus()
}
function toggleDrawer() { realtimeNotificationsOpen.value = !realtimeNotificationsOpen.value }
function outside(event) {
  if (!trigger.value?.contains(event.target) && !panel.value?.contains(event.target)) closeDrawer()
}
function keyboard(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeDrawer(true) }
}
function focusOutside(event) { outside(event) }
function removeListeners() {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', keyboard)
  document.removeEventListener('focusin', focusOutside)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', positionPanel, true)
}
watch(realtimeNotificationsOpen, async (open) => {
  removeListeners()
  if (!open) return
  positionPanel()
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', keyboard)
  document.addEventListener('focusin', focusOutside)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', positionPanel, true)
  await nextTick()
  if (realtimeNotificationsOpen.value) panel.value?.focus({ preventScroll: true })
})
onBeforeUnmount(removeListeners)
function openNotice(notification) { closeDrawer(); void openRealtimeNotification(notification) }
function viewAll() { closeDrawer(); void goToSection('solicitudes') }
function aircraftName(notification) {
  const value = notification.payload?.aircraft_name || notification.payload?.aircraft
  return typeof value === 'string' && value !== 'Aeronave por confirmar' ? value : ''
}
function noticeTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}
</script>

<style scoped>
.operator-bell { position: relative; width: 40px; height: 40px; flex: 0 0 40px; }
.operator-bell__button { position: relative; display: grid; place-items: center; width: 40px; height: 40px; padding: 8px; border: 1px solid #c9a06355; border-radius: 50%; background: #ffffff0d; color: #c9a063; cursor: pointer; }
.operator-bell__button svg { width: 22px; height: 22px; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.operator-bell__badge { position: absolute; top: -3px; right: -4px; min-width: 18px; height: 18px; padding: 0 3px; display: grid; place-items: center; border-radius: 20px; background: #dc3545; color: white; font-size: 10px; font-weight: 700; box-sizing: border-box; }
.operator-notice { position: fixed; z-index: 10000; width: min(360px, calc(100vw - 24px)); box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; border: 1px solid #17324d22; border-radius: 14px; background: #fff; color: #17324d; box-shadow: 0 12px 36px #10253c26; font-family: inherit; }
.operator-notice button { font-family: inherit; cursor: pointer; }
.operator-notice button:focus-visible, .operator-bell__button:focus-visible { outline: 2px solid #3179ba; outline-offset: -2px; }
.operator-notice__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-bottom: 1px solid #17324d14; flex: 0 0 auto; }
.operator-notice__header h2 { margin: 0; font-size: 15px; font-weight: 700; }
.operator-notice__header button { max-width: 120px; padding: 0; border: 0; background: none; color: #37688f; font-size: 10px; text-align: right; }
.operator-notice__header button:disabled { opacity: .45; cursor: default; }
.operator-notice__list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.operator-notice__row { background: #fff; border-bottom: 1px solid #17324d0d; }
.operator-notice__row.is-unread { background: #f3f8fd; }
.operator-notice__open { width: 100%; display: flex; align-items: flex-start; gap: 9px; text-align: left; padding: 12px; border: 0; background: transparent; color: inherit; }
.operator-notice__icon { color: #2978b7; font-size: 19px; flex: 0 0 22px; }
.operator-notice__copy { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.operator-notice__title { font-size: 12px; font-weight: 600; }
.operator-notice__route, .operator-notice__aircraft { font-size: 11px; color: #5b6b7d; overflow-wrap: anywhere; }
.operator-notice time { font-size: 10px; color: #8390a0; }
.operator-notice__status { border-radius: 5px; padding: 3px 5px; background: #e6f0fb; color: #286ca4; font-size: 9px; flex-shrink: 0; }
.is-confirmed .operator-notice__icon { color: #26835b; }
.is-confirmed .operator-notice__status { background: #e8f5ee; color: #287750; }
.is-read .operator-notice__icon, .is-read .operator-notice__title { color: #788593; }
.is-read .operator-notice__status { background: #f0f2f4; color: #788593; }
.operator-notice__read { margin: 0 12px 8px 43px; padding: 0; border: 0; background: none; color: #537794; font-size: 10px; }
.operator-notice__empty { padding: 24px 16px; margin: 0; font-size: 12px; color: #65768a; }
.operator-notice__footer { padding: 12px; border-top: 1px solid #17324d14; display: grid; gap: 10px; flex: 0 0 auto; }
.operator-notice__footer button { border: 0; padding: 0; background: none; color: #35698f; font-size: 12px; }
.operator-notice__footer button + button { font-size: 10px; color: #788593; }
.operator-notice-enter-active, .operator-notice-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.operator-notice-enter-from, .operator-notice-leave-to { opacity: 0; transform: translateY(-4px); }
@media (max-width: 1080px) {
  .operator-bell, .operator-bell__button { width: 44px; height: 44px; flex-basis: 44px; }
}
@media (max-width: 600px) {
  .operator-notice__header { gap: 8px; padding: 8px 12px; }
  .operator-notice__header button { min-height: 44px; font-size: 11px; }
  .operator-notice__open { min-height: 44px; gap: 7px; }
  .operator-notice__title { font-size: 13px; overflow-wrap: anywhere; }
  .operator-notice__route, .operator-notice__aircraft { font-size: 12px; }
  .operator-notice__read { min-height: 44px; margin-bottom: 0; font-size: 12px; }
  .operator-notice__footer { gap: 0; padding: 4px 12px; }
  .operator-notice__footer button { min-height: 44px; }
  .operator-notice__footer button + button { font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) { .operator-notice-enter-active, .operator-notice-leave-active { transition: none; } }
</style>
