<script setup>
defineProps({
  passengers: { type: Array, required: true },
})

const emit = defineEmits(['add-passenger', 'remove-passenger'])
</script>

<template>
  <div class="step-fields">
    <section v-for="(passenger, index) in passengers" :key="passenger.id" class="passenger-card">
      <div class="card-title-row">
        <strong>Pasajero {{ index + 1 }}</strong>
        <button
          v-if="passengers.length > 1"
          type="button"
          class="text-button"
          @click="emit('remove-passenger', index)"
        >
          Quitar
        </button>
      </div>

      <label>
        Nombre completo
        <input v-model="passenger.name" type="text" placeholder="Nombre completo" />
      </label>

      <div class="form-grid">
        <label>
          Fecha de nacimiento
          <input v-model="passenger.birthDate" type="date" />
        </label>

        <label>
          Nacionalidad
          <input v-model="passenger.nationality" type="text" placeholder="Mexicana" />
        </label>

        <label>
          Tipo de documento
          <select v-model="passenger.documentType">
            <option value="INE">INE</option>
            <option value="Pasaporte">Pasaporte</option>
          </select>
        </label>

        <label>
          Numero de documento
          <input v-model="passenger.documentNumber" type="text" placeholder="Numero de documento" />
        </label>
      </div>
    </section>

    <button type="button" class="secondary-button add-button" @click="emit('add-passenger')">
      Agregar pasajero
    </button>
  </div>
</template>
