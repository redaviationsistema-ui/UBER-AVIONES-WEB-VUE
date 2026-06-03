<script setup>
defineProps({
  form: { type: Object, required: true },
})

function handleUppercaseInput(event, form, field) {
  form[field] = String(event?.target?.value || '').toUpperCase()
}
</script>

<template>
  <div class="step-fields">
    <p class="form-note">
      {{
        form.role === 'sobrecargo'
          ? 'Primero llena los datos base y revisa la informacion detectada de la licencia antes de continuar.'
          : 'Primero llena los datos base. Despues toma una selfie desde la camara para validarla de una vez contra el backend antes de continuar.'
      }}
    </p>

    <label>
      Nombre completo
      <input
        :value="form.name"
        type="text"
        placeholder="Nombre completo"
        autocomplete="name"
        @input="handleUppercaseInput($event, form, 'name')"
      />
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
