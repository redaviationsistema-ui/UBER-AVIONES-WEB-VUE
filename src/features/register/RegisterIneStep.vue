<script setup>
import { ref } from 'vue'
import { scanIneFiles } from './ineScanner'

defineProps({
  form: { type: Object, required: true },
})

const emit = defineEmits(['file-selected'])

const scanning = ref(false)
const scanMessage = ref('')

function mergeIneData(form, detectedData) {
  form.ineScanRaw = detectedData.raw || form.ineScanRaw
  form.ineCurp = detectedData.curp || form.ineCurp
  form.documentNumber = detectedData.clave || form.documentNumber
  form.documentExpiration = detectedData.expirationDate || form.documentExpiration
  form.ineCic = detectedData.cic || form.ineCic
  form.ineOcr = detectedData.ocr || form.ineOcr

  if (!form.name && detectedData.name) {
    form.name = detectedData.name
  }

  if (!form.birthDate && detectedData.birthDate) {
    form.birthDate = detectedData.birthDate
  }

  if (!form.nationality && detectedData.curp) {
    form.nationality = 'Mexicana'
  }
}

function hasUsefulScanData(data) {
  return Boolean(data.curp || data.clave || data.cic || data.ocr || data.name)
}

function detectedFieldsLabel(data) {
  const fields = [
    data.clave ? 'numero de documento' : '',
    data.expirationDate ? 'vigencia' : '',
    data.curp ? 'CURP' : '',
    data.cic ? 'CIC' : '',
    data.ocr ? 'OCR' : '',
    data.name ? 'nombre' : '',
    data.birthDate ? 'fecha de nacimiento' : '',
  ].filter(Boolean)

  if (!fields.length) return ''
  return fields.join(', ')
}

async function scanIne(form) {
  scanMessage.value = ''

  if (!form.ineFront || !form.ineBack) {
    scanMessage.value = 'Sube la imagen de frente y reverso para escanear la INE.'
    return
  }

  scanning.value = true
  scanMessage.value = 'Escaneando codigos y texto de la INE...'

  try {
    const scanResult = await scanIneFiles([form.ineFront, form.ineBack])

    if (!scanResult.rawText) {
      form.ineScanStatus = 'pending'
      scanMessage.value =
        'No se detecto texto legible. Usa una foto clara, derecha, sin reflejos y con la INE completa.'
      return
    }

    mergeIneData(form, scanResult.data)
    form.ineScanStatus = hasUsefulScanData(scanResult.data) ? 'scanned' : 'partial'
    const fieldsLabel = detectedFieldsLabel(scanResult.data)
    scanMessage.value =
      scanResult.method === 'codigo'
        ? 'Datos escaneados correctamente desde el codigo de la INE.'
        : fieldsLabel
          ? `Datos obtenidos por OCR: ${fieldsLabel}. Puedes corregirlos antes de continuar.`
          : 'OCR completado. Captura manualmente los datos que no se hayan detectado.'
  } catch {
    form.ineScanStatus = 'pending'
    scanMessage.value =
      'No fue posible leer la INE. Intenta con una imagen mas nitida o captura los datos manualmente.'
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <div class="step-fields">
    <div class="form-grid">
      <label>
        Identificacion
        <select v-model="form.documentType">
          <option value="INE">INE</option>
          <option value="Pasaporte">Pasaporte</option>
        </select>
      </label>

      <label>
        Numero de documento
        <input v-model="form.documentNumber" type="text" placeholder="Se llena al escanear" />
      </label>

      <label>
        Vigencia
        <input v-model="form.documentExpiration" type="date" />
        <small>Si no se detecta al escanear, puedes capturarla manualmente.</small>
      </label>

      <label class="checkbox-field">
        <input v-model="form.identityValidationRequired" type="checkbox" />
        <span>Requiere validar identidad con foto del documento</span>
      </label>
    </div>

    <div v-if="form.identityValidationRequired" class="file-grid">
      <label class="file-card">
        <span>{{ form.documentType }} frente</span>
        <strong>{{ form.ineFrontName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="emit('file-selected', 'ineFront', $event)" />
      </label>

      <label class="file-card">
        <span>{{ form.documentType }} reverso</span>
        <strong>{{ form.ineBackName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="emit('file-selected', 'ineBack', $event)" />
      </label>
    </div>

    <button
      v-if="form.identityValidationRequired"
      type="button"
      class="scan-button"
      :disabled="scanning"
      @click="scanIne(form)"
    >
      {{ scanning ? 'Escaneando INE...' : 'Escanear datos de la INE' }}
    </button>

    <section class="scan-results">
      <p class="eyebrow">Datos detectados y editables</p>
      <div class="scan-result-grid">
        <label v-if="form.name">
          Nombre completo
          <input v-model="form.name" type="text" />
        </label>
        <label v-if="form.birthDate">
          Fecha de nacimiento
          <input v-model="form.birthDate" type="date" />
        </label>
        <label v-if="form.nationality">
          Nacionalidad
          <input v-model="form.nationality" type="text" />
        </label>
        <label v-if="form.documentExpiration">
          Vigencia
          <input v-model="form.documentExpiration" type="date" />
        </label>
        <label v-if="form.documentNumber">
          Clave de elector
          <input v-model="form.documentNumber" type="text" />
        </label>
        <label>
          CURP
          <input v-model="form.ineCurp" type="text" placeholder="Captura CURP si no se detecto" />
        </label>
        <label v-if="form.ineCic">
          CIC
          <input v-model="form.ineCic" type="text" />
        </label>
        <label v-if="form.ineOcr">
          OCR
          <input v-model="form.ineOcr" type="text" />
        </label>
      </div>
      <p
        v-if="
          !form.name &&
          !form.birthDate &&
          !form.nationality &&
          !form.documentExpiration &&
          !form.documentNumber &&
          !form.ineCurp &&
          !form.ineCic &&
          !form.ineOcr
        "
        class="scan-message"
      >
        Aun no hay datos detectados. Sube frente y reverso, despues presiona escanear.
      </p>
      <p v-if="scanMessage" class="scan-message">{{ scanMessage }}</p>
    </section>
  </div>
</template>
