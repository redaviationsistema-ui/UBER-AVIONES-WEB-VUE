<script setup>
defineProps({
  form: { type: Object, required: true },
})
</script>

<template>
  <div class="step-fields">
    <p class="form-note">
      Si la INE completo algun dato, revisalo aqui y modificalo antes de continuar.
    </p>

    <label>
      Nombre completo
      <input v-model="form.name" type="text" placeholder="Nombre completo" autocomplete="name" />
    </label>

    <div class="form-grid">
      <label>
        Correo
        <input v-model="form.email" type="email" placeholder="correo@empresa.com" autocomplete="email" />
      </label>

      <label>
        Telefono
        <input v-model="form.phone" type="tel" placeholder="+52 55 0000 0000" autocomplete="tel" />
      </label>

      <label>
        Fecha de nacimiento
        <input v-model="form.birthDate" type="date" />
      </label>

      <label>
        Nacionalidad
        <input v-model="form.nationality" type="text" placeholder="Mexicana" />
      </label>
    </div>
  </div>
</template>
