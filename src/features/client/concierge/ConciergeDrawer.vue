<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue'
import ConciergeFooter from './components/ConciergeFooter.vue'
import ConciergeHeader from './components/ConciergeHeader.vue'
import ConciergeProfile from './components/ConciergeProfile.vue'
import ConciergeCommunication from './components/ConciergeCommunication.vue'
import ConciergeServices from './components/ConciergeServices.vue'

const props = defineProps({
  config: { type: Object, required: true },
  isOpen: { type: Boolean, required: true },
})

const emit = defineEmits(['close', 'communication', 'service'])

function handleKeydown(event) {
  if (event.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', handleKeydown))

watch(
  () => props.isOpen,
  (nextValue) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = nextValue ? 'hidden' : ''
  },
  { immediate: true },
)
</script>

<template>
  <transition name="concierge-drawer">
    <div v-if="isOpen" class="concierge-drawer-backdrop" @click.self="$emit('close')">
      <aside class="concierge-drawer" role="dialog" :aria-label="config.aria.drawer">
        <ConciergeHeader :header="config.header" :close-label="config.aria.close" @close="$emit('close')" />
        <ConciergeProfile :profile="config.profile" />
        <ConciergeCommunication :communication="config.communication" @select="$emit('communication', $event)" />
        <ConciergeServices :services="config.services" @select="$emit('service', $event)" />
        <ConciergeFooter :footer="config.footer" />
      </aside>
    </div>
  </transition>
</template>

<style scoped>
.concierge-drawer-enter-active,.concierge-drawer-leave-active{transition:opacity .3s ease}
.concierge-drawer-enter-active .concierge-drawer,.concierge-drawer-leave-active .concierge-drawer{transition:transform .3s ease}
.concierge-drawer-enter-from,.concierge-drawer-leave-to{opacity:0}
.concierge-drawer-enter-from .concierge-drawer,.concierge-drawer-leave-to .concierge-drawer{transform:translateX(100%)}
.concierge-drawer-backdrop{position:fixed;inset:0;z-index:120;display:flex;justify-content:flex-end;background:rgba(6,12,22,.34);backdrop-filter:blur(4px);padding:1rem}
.concierge-drawer{width:min(100%,30rem);height:calc(100vh - 2rem);overflow:auto;display:grid;align-content:start;gap:1.1rem;padding:1.25rem;border-radius:24px;background:#0f1e36;color:#fff;box-shadow:0 30px 80px rgba(7,16,31,.42)}
@media (max-width: 760px){.concierge-drawer-backdrop{padding:.5rem}.concierge-drawer{width:100%;height:calc(100vh - 1rem);padding:1rem;border-radius:24px}}
</style>
