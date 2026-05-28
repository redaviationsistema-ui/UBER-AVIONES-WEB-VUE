<script setup>
defineProps({
  form: { type: Object, required: true },
})

const taxRegimes = [
  '601 - General de Ley Personas Morales',
  '612 - Personas Fisicas con Actividades Empresariales',
  '616 - Sin obligaciones fiscales',
  '626 - Regimen Simplificado de Confianza',
]

const cfdiUses = [
  'G01 - Adquisicion de mercancias',
  'G03 - Gastos en general',
  'I02 - Mobiliario y equipo de oficina',
  'S01 - Sin efectos fiscales',
]
</script>

<template>
  <div class="step-fields">
    <div class="form-grid">
      <label>
        RFC
        <input v-model="form.billingRfc" type="text" placeholder="RFC" />
      </label>

      <label>
        Razon social
        <input v-model="form.billingName" type="text" placeholder="Razon social" />
      </label>

      <label>
        Regimen fiscal
        <select v-model="form.billingRegime">
          <option value="">Selecciona regimen</option>
          <option v-for="regime in taxRegimes" :key="regime" :value="regime">{{ regime }}</option>
        </select>
      </label>

      <label>
        Codigo postal fiscal
        <input v-model="form.billingPostalCode" type="text" inputmode="numeric" placeholder="00000" />
      </label>

      <label class="wide-field">
        Uso CFDI
        <select v-model="form.billingCfdiUse">
          <option value="">Selecciona uso CFDI</option>
          <option v-for="use in cfdiUses" :key="use" :value="use">{{ use }}</option>
        </select>
      </label>
    </div>
  </div>
</template>
