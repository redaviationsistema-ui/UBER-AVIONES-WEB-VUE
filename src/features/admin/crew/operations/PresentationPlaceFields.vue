<script setup>
defineProps({
  typeValue: { type: String, default: '' },
  detailValue: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  typeError: { type: String, default: '' },
  detailError: { type: String, default: '' },
  placeTypes: { type: Array, default: () => ['FBO', 'Base', 'Aeropuerto', 'Hangar', 'Otro'] },
})

defineEmits(['update:typeValue', 'update:detailValue'])
</script>

<template>
  <div class="presentation-fields">
    <label class="field" :class="{ 'field--error': typeError }">
      <span>Tipo de lugar</span>
      <select
        :value="typeValue"
        :disabled="disabled"
        @change="$emit('update:typeValue', $event.target.value)"
      >
        <option value="">Selecciona</option>
        <option v-for="item in placeTypes" :key="item" :value="item">{{ item }}</option>
      </select>
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
