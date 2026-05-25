<script setup>
const baseUrl = String(import.meta.env.BASE_URL || '/')
const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
const logoUrl = `${normalizedBaseUrl}logo.png`

defineProps({
  alt: {
    type: String,
    default: 'Sky Group',
  },
  variant: {
    type: String,
    default: 'dark',
    validator: (value) => ['dark', 'light'].includes(value),
  },
  width: {
    type: [Number, String],
    default: 148,
  },
})
</script>

<template>
  <span class="brand-logo" :class="`brand-logo--${variant}`">
    <img
      class="brand-logo__image"
      :src="logoUrl"
      :alt="alt"
      :style="{ width: typeof width === 'number' ? `${width}px` : width }"
    />
  </span>
</template>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.brand-logo__image {
  display: block;
  height: auto;
  max-width: 100%;
}

.brand-logo--light .brand-logo__image {
  filter: brightness(0) invert(1);
}
</style>
