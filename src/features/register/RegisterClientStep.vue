<script setup>
const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update-field'])

function handleUppercaseInput(event, field) {
  emit('update-field', field, String(event?.target?.value || '').toUpperCase())
}

function updateField(field, value) {
  emit('update-field', field, value)
}

function fieldError(field) {
  return props.errors?.[field] || ''
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

    <label
      v-if="form.role === 'provider'"
      data-field="companyName"
      :class="{ 'has-error': fieldError('companyName') }"
    >
      Nombre de la empresa
      <input
        :value="form.companyName"
        type="text"
        placeholder="Nombre comercial de la empresa"
        autocomplete="organization"
        @input="updateField('companyName', $event.target.value)"
      />
      <small v-if="fieldError('companyName')" class="field-error">{{ fieldError('companyName') }}</small>
      <small>Usa el nombre comercial con el que opera la empresa.</small>
    </label>

    <label
      v-if="form.role === 'provider'"
      data-field="legalName"
      :class="{ 'has-error': fieldError('legalName') }"
    >
      Razon social
      <input
        :value="form.legalName"
        type="text"
        placeholder="Razon social"
        autocomplete="organization"
        @input="updateField('legalName', $event.target.value)"
      />
      <small v-if="fieldError('legalName')" class="field-error">{{ fieldError('legalName') }}</small>
    </label>

    <div v-if="form.role === 'provider'" class="form-grid">
      <label data-field="companyPhone" :class="{ 'has-error': fieldError('companyPhone') }">
        Telefono de la empresa
        <input
          :value="form.companyPhone"
          type="tel"
          placeholder="+52 55 0000 0000"
          autocomplete="tel"
          @input="updateField('companyPhone', $event.target.value)"
        />
        <small v-if="fieldError('companyPhone')" class="field-error">{{ fieldError('companyPhone') }}</small>
      </label>

      <label data-field="companyEmail" :class="{ 'has-error': fieldError('companyEmail') }">
        Email de la empresa
        <input
          :value="form.companyEmail"
          type="email"
          placeholder="operaciones@empresa.com"
          autocomplete="email"
          @input="updateField('companyEmail', $event.target.value)"
        />
        <small v-if="fieldError('companyEmail')" class="field-error">{{ fieldError('companyEmail') }}</small>
      </label>
    </div>

    <div v-if="form.role === 'provider'" class="block-head">
      <p class="eyebrow">Representante legal</p>
    </div>

    <label
      v-if="form.role === 'provider'"
      data-field="name"
      :class="{ 'has-error': fieldError('name') }"
    >
      Nombre completo
      <input
        :value="form.name"
        type="text"
        placeholder="Nombre completo"
        autocomplete="name"
        @input="handleUppercaseInput($event, 'name')"
      />
      <small v-if="fieldError('name')" class="field-error">{{ fieldError('name') }}</small>
    </label>

    <div v-if="form.role === 'provider'" class="form-grid">
      <label data-field="phone" :class="{ 'has-error': fieldError('phone') }">
        Telefono del representante
        <input
          :value="form.phone"
          type="tel"
          placeholder="+52 55 0000 0000"
          autocomplete="tel"
          @input="updateField('phone', $event.target.value)"
        />
        <small v-if="fieldError('phone')" class="field-error">{{ fieldError('phone') }}</small>
      </label>

      <label data-field="birthDate" :class="{ 'has-error': fieldError('birthDate') }">
        Fecha de nacimiento
        <input :value="form.birthDate" type="date" @input="updateField('birthDate', $event.target.value)" />
        <small v-if="fieldError('birthDate')" class="field-error">{{ fieldError('birthDate') }}</small>
      </label>
    </div>

    <label v-if="form.role === 'provider'">
      Nombre comercial alterno
      <input
        :value="form.commercialName"
        type="text"
        placeholder="Opcional"
        autocomplete="organization"
        @input="updateField('commercialName', $event.target.value)"
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
          @input="handleUppercaseInput($event, 'name')"
        />
      </label>

      <div class="form-grid">
        <label>
          Telefono
          <input
            :value="form.phone"
            type="tel"
            placeholder="+52 55 0000 0000"
            autocomplete="tel"
            @input="updateField('phone', $event.target.value)"
          />
        </label>

        <label v-if="form.role !== 'sobrecargo'">
          Fecha de nacimiento
          <input :value="form.birthDate" type="date" @input="updateField('birthDate', $event.target.value)" />
        </label>
      </div>
    </template>
  </div>
</template>
