<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
defineProps({ busy: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
let previousFocus
onMounted(() => {
  previousFocus = document.activeElement
  dialog.value.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  previousFocus?.focus?.({ preventScroll: true })
})
function trapFocus(event) {
  if (event.key !== 'Tab') return
  const nodes = [...dialog.value.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')]
  const first = nodes[0]
  const last = nodes.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="crew-incident-modal" aria-labelledby="crew-incident-title" @cancel.prevent="!busy && emit('close')" @keydown="trapFocus">
      <header><h2 id="crew-incident-title">Reportar incidencia</h2><button type="button" aria-label="Cerrar incidencia" :disabled="busy" @click="emit('close')">×</button></header>
      <slot />
      <button type="button" class="ghost-button action-button" :disabled="busy" @click="emit('close')">Cancelar</button>
    </dialog>
  </Teleport>
</template>
<style scoped>
.crew-incident-modal { position: fixed; inset: 0; margin: auto; width: min(640px, calc(100% - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto; box-sizing: border-box; padding: 1.5rem; border: 1px solid #ddd; border-radius: 20px; background: white; color: #18283d; box-shadow: 0 24px 80px #0005; }
.crew-incident-modal::backdrop { background: #08182c99; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
h2 { margin: 0; font-size: 1.4rem; }
header button { font-size: 1.8rem; background: none; border: 0; cursor: pointer; }
</style>
