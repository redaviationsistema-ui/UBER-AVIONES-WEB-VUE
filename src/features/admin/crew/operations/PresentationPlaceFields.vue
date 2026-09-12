<script setup>
defineProps({
  typeValue: { type: String, default: '' },
  detailValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  typeError: { type: String, default: '' },
  detailError: { type: String, default: '' },
  placeTypes: { type: Array, default: () => [] },
})

defineEmits(['update:typeValue', 'update:detailValue'])
</script>

<template>
  <div class="presentation-fields">
    <label class="field" :class="{ 'field--error': typeError }">
      <span>Tipo de lugar</span>
      <input
        :value="typeValue"
        type="text"
        :disabled="disabled"
        placeholder="Escriba el punto de presentación"
        autocomplete="off"
        @input="$emit('update:typeValue', $event.target.value)"
      />
      <small v-if="typeError" class="inline-error">{{ typeError }}</small>
    </label>

    <label class="field" :class="{ 'field--error': detailError }">
      <span>Detalle del lugar</span>
      <input
        :value="detailValue"
        type="text"
        :disabled="disabled"
        placeholder=""
        @input="$emit('update:detailValue', $event.target.value)"
      />
      <small v-if="detailError" class="inline-error">{{ detailError }}</small>
    </label>
  </div>
</template>

<style scoped>
.presentation-fields {
  display: grid;
  gap: 0.9rem;
}
</style>
