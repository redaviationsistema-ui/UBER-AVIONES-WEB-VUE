<script setup>
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

const logoSrc = `${import.meta.env.BASE_URL}logo.png`
</script>

<template>
  <span class="brand-logo" :class="`brand-logo--${variant}`">
    <img
      class="brand-logo__image"
      :src="logoSrc"
      :alt="alt"
      :width="width"
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
