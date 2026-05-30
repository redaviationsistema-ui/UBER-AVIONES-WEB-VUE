<script setup>
import BarraSuperiorCliente from './navegacion/BarraSuperiorCliente.vue'

defineProps({
  activePlan: { type: String, required: true },
  activeSection: { type: String, required: true },
  items: { type: Array, required: true },
  profileOpen: { type: Boolean, default: false },
  userFirstName: { type: String, required: true },
})

const emit = defineEmits(['logout', 'navigate', 'toggle-profile'])
</script>

<template>
  <BarraSuperiorCliente
    v-bind="$props"
    @logout="emit('logout', $event)"
    @navigate="emit('navigate', $event)"
    @toggle-profile="emit('toggle-profile', $event)"
  />
</template>
