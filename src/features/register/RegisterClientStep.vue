<script setup>
/* eslint-disable vue/no-mutating-props */
defineProps({
  form: { type: Object, required: true },
})

function handleUppercaseInput(event, form, field) {
  form[field] = String(event?.target?.value || '').toUpperCase()
}
</script>

<template>
  <div class="step-fields">
    <div v-if="form.role === 'sobrecargo'" class="block-head">
      <p class="eyebrow">Datos del usuario</p>
    </div>

    <div v-else-if="form.role === 'provider'" class="block-head">
      <p class="eyebrow">Empresa y representante legal</p>
    </div>

    <p v-if="form.role !== 'sobrecargo'" class="form-note">
      Primero llena los datos base. Despues toma una selfie desde la camara para validarla de una vez contra el backend antes de continuar.
    </p>

    <label v-if="form.role === 'provider'">
      Nombre de la empresa
      <input
        v-model="form.companyName"
        type="text"
        placeholder="Nombre comercial de la empresa"
        autocomplete="organization"
      />
      <small>Usa el nombre comercial con el que opera la empresa.</small>
    </label>

    <label v-if="form.role === 'provider'">
      Razon social
      <input
        v-model="form.legalName"
        type="text"
        placeholder="Razon social"
        autocomplete="organization"
      />
    </label>

    <div v-if="form.role === 'provider'" class="form-grid">
      <label>
        Telefono de la empresa
        <input
          v-model="form.companyPhone"
          type="tel"
          placeholder="+52 55 0000 0000"
          autocomplete="tel"
        />
      </label>

      <label>
        Email de la empresa
        <input
          v-model="form.companyEmail"
          type="email"
          placeholder="operaciones@empresa.com"
          autocomplete="email"
        />
      </label>
    </div>

    <div v-if="form.role === 'provider'" class="block-head">
      <p class="eyebrow">Representante legal</p>
    </div>

    <label v-if="form.role === 'provider'">
      Nombre completo
      <input
        :value="form.name"
        type="text"
        placeholder="Nombre completo"
        autocomplete="name"
        @input="handleUppercaseInput($event, form, 'name')"
      />
    </label>

    <div v-if="form.role === 'provider'" class="form-grid">
      <label>
        Telefono del representante
        <input v-model="form.phone" type="tel" placeholder="+52 55 0000 0000" autocomplete="tel" />
      </label>

      <label>
        Fecha de nacimiento
        <input v-model="form.birthDate" type="date" />
      </label>
    </div>

    <label v-if="form.role === 'provider'">
      Nombre comercial alterno
      <input
        v-model="form.commercialName"
        type="text"
        placeholder="Opcional"
        autocomplete="organization"
      />
    </label>

    <template v-else>
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

        <label v-if="form.role !== 'sobrecargo'">
          Fecha de nacimiento
          <input v-model="form.birthDate" type="date" />
        </label>
      </div>
    </template>
  </div>
</template>
