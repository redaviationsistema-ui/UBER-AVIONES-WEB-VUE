<script setup>
defineProps({
  steps: { type: Array, required: true },
  currentStep: { type: Number, required: true },
})
</script>

<template>
  <nav class="register-progress" aria-label="Progreso de registro">
    <span
      v-for="(step, index) in steps"
      :key="step.id"
      class="progress-dot"
      :class="{ active: index === currentStep, complete: index < currentStep }"
    >
      <small>{{ index + 1 }}</small>
      <strong>{{ step.title }}</strong>
    </span>
  </nav>
</template>
