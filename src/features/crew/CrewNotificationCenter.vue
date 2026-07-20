<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../../lib/api'
import { normalizeApiError } from '../../lib/apiError'

const router = useRouter()
const open = ref(false)
const loading = ref(false)
const error = ref('')
const notifications = ref([])
const unreadCount = ref(0)
const panel = ref(null)

const hasNotifications = computed(() => notifications.value.length > 0)

function normalizePage(response = {}) {
  const page = response.notifications || response.data?.notifications || {}
  return Array.isArray(page) ? page : page.data || []
}

async function loadNotifications() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.get('/notifications', { query: { per_page: 20 } })
    notifications.value = normalizePage(response)
    unreadCount.value = Number(response.unread_count ?? response.data?.unread_count ?? notifications.value.filter((item) => !item.read_at).length)
  } catch (loadError) {
    error.value = normalizeApiError(loadError).message
  } finally {
    loading.value = false
  }
}

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await loadNotifications()
    await nextTick()
    panel.value?.focus()
  }
}

async function markRead(notification) {
  if (!notification.read_at) {
    const response = await api.patch(`/notifications/${notification.id}/read`, {})
    notification.read_at = response.notification?.read_at || new Date().toISOString()
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
  const target = notification.payload?.url || notification.data?.url
  if (target) {
    open.value = false
    await router.push(target)
  }
}

async function markAllRead() {
  await api.patch('/notifications/read-all', {})
  const readAt = new Date().toISOString()
  notifications.value.forEach((item) => { item.read_at ||= readAt })
  unreadCount.value = 0
}

function onKeydown(event) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
    document.querySelector('[data-crew-notification-trigger]')?.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void loadNotifications()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="crew-notification-center" aria-label="Centro de notificaciones">
    <button
      type="button"
      class="crew-notification-trigger"
      data-crew-notification-trigger
      :aria-expanded="open"
      aria-controls="crew-notification-panel"
      @click="toggle"
    >
      Notificaciones
      <span v-if="unreadCount" class="crew-notification-count" aria-label="notificaciones no leídas">{{ unreadCount }}</span>
    </button>

    <div
      v-if="open"
      id="crew-notification-panel"
      ref="panel"
      class="crew-notification-panel surface"
      role="region"
      aria-label="Notificaciones operativas"
      tabindex="-1"
    >
      <header>
        <div><strong>Notificaciones operativas</strong><small>{{ unreadCount }} sin leer</small></div>
        <button type="button" :disabled="!unreadCount" @click="markAllRead">Marcar todas como leídas</button>
      </header>
      <p v-if="loading" aria-live="polite">Cargando notificaciones…</p>
      <div v-else-if="error" class="crew-notification-error" role="alert">
        <p>{{ error }}</p><button type="button" @click="loadNotifications">Reintentar</button>
      </div>
      <p v-else-if="!hasNotifications" class="muted">No tienes notificaciones operativas.</p>
      <ul v-else class="crew-notification-list">
        <li v-for="item in notifications" :key="item.id" :data-level="item.payload?.level || item.data?.level || 'info'" :class="{ unread: !item.read_at }">
          <button type="button" @click="markRead(item)">
            <span class="crew-notification-level">{{ item.payload?.level || item.data?.level || 'info' }}</span>
            <strong>{{ item.title }}</strong>
            <span>{{ item.message }}</span>
            <time :datetime="item.created_at">{{ new Date(item.created_at).toLocaleString('es-MX') }}</time>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.crew-notification-center{position:sticky;top:12px;z-index:30;display:flex;justify-content:flex-end;margin:0 0 12px}.crew-notification-trigger{min-height:44px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;padding:8px 14px;font-weight:700}.crew-notification-count{display:inline-grid;place-items:center;min-width:22px;height:22px;margin-left:6px;border-radius:999px;background:#b91c1c;color:#fff}.crew-notification-panel{position:absolute;top:50px;right:0;width:min(420px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 90px));overflow:auto;padding:16px;border:1px solid #dbe3ed;box-shadow:0 18px 50px #0f172a33}.crew-notification-panel:focus-visible,.crew-notification-trigger:focus-visible,.crew-notification-panel button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}.crew-notification-panel header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.crew-notification-panel header div{display:grid}.crew-notification-list{display:grid;gap:8px;padding:0;list-style:none}.crew-notification-list li{border-left:4px solid #2563eb;border-radius:8px;background:#f8fafc}.crew-notification-list li[data-level='warning']{border-color:#d97706}.crew-notification-list li[data-level='critical']{border-color:#b91c1c;background:#fff1f2}.crew-notification-list li[data-level='success']{border-color:#15803d}.crew-notification-list li.unread{box-shadow:inset 0 0 0 1px #94a3b8}.crew-notification-list button{display:grid;width:100%;gap:4px;border:0;background:transparent;padding:12px;text-align:left}.crew-notification-level{text-transform:uppercase;font-size:.7rem;font-weight:800}.crew-notification-list time{font-size:.75rem;color:#64748b}.crew-notification-error{color:#991b1b}@media(max-width:390px){.crew-notification-center{top:6px}.crew-notification-panel{position:fixed;top:64px;right:8px;left:8px;width:auto;max-height:calc(100vh - 76px)}.crew-notification-panel header{flex-direction:column}.crew-notification-panel header button{min-height:44px}}
</style>
