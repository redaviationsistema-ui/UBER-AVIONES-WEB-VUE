<script setup>
defineProps({
  form: { type: Object, required: true },
})
</script>

<template>
  <div class="step-fields">
    <p v-if="form.ineScanStatus === 'scanned' || form.ineScanStatus === 'partial'" class="form-note">
      La informacion detectada en la INE se refleja aqui. Revisa y corrige lo necesario antes de continuar.
    </p>
    <p v-else class="form-note">
      Si escaneas la INE en esta misma pantalla, los datos detectados se reflejaran aqui para revision.
    </p>

    <label>
      Nombre completo
      <input v-model="form.name" type="text" placeholder="Nombre completo" autocomplete="name" />
    </label>

    <div class="form-grid">
      <label>
        Telefono
        <input v-model="form.phone" type="tel" placeholder="+52 55 0000 0000" autocomplete="tel" />
      </label>

      <label>
        Fecha de nacimiento
        <input v-model="form.birthDate" type="date" />
      </label>
    </div>
  </div>
</template>
