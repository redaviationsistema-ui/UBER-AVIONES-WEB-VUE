<script setup>
import { ref } from 'vue'
import { scanIneFiles } from './ineScanner'

const props = defineProps({
  form: { type: Object, required: true },
})

const emit = defineEmits(['file-selected', 'update-field', 'merge-fields'])

const scanning = ref(false)
const scanMessage = ref('')

function updateField(field, value) {
  emit('update-field', field, value)
}

function mergeIneData(form, detectedData) {
  return {
    ineScanRaw: detectedData.raw || form.ineScanRaw,
    ineCurp: detectedData.curp || form.ineCurp,
    documentNumber: detectedData.clave || form.documentNumber,
    documentExpiration: detectedData.expirationDate || form.documentExpiration,
    ineCic: detectedData.cic || form.ineCic,
    ineOcr: detectedData.ocr || form.ineOcr,
    name: form.name || detectedData.name || '',
    birthDate: form.birthDate || detectedData.birthDate || '',
    nationality: form.nationality || (detectedData.curp ? 'Mexicana' : ''),
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

function hasDetectedEditableData(form) {
  return Boolean(
    form.name ||
      form.birthDate ||
      form.nationality ||
      form.documentExpiration ||
      form.documentNumber ||
      form.ineCurp ||
      form.ineCic ||
      form.ineOcr,
  )
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
    const hasUsefulData = hasUsefulScanData(scanResult.data)

    if (!scanResult.rawText) {
      emit('merge-fields', { ineScanStatus: 'pending' })
      scanMessage.value =
        'No se detecto texto legible. Usa una foto clara, derecha, sin reflejos y con la INE completa.'
      return
    }

    emit('merge-fields', {
      ...mergeIneData(form, scanResult.data),
      ineScanStatus: hasUsefulData ? 'scanned' : 'partial',
    })

    const fieldsLabel = detectedFieldsLabel(scanResult.data)
    scanMessage.value =
      scanResult.method === 'codigo' && hasUsefulData
        ? 'Datos escaneados correctamente desde el codigo de la INE.'
        : scanResult.method === 'codigo+ocr' && hasUsefulData
          ? fieldsLabel
            ? `Se detecto el codigo y se completaron datos con OCR: ${fieldsLabel}.`
            : 'Se detecto el codigo y se reforzo la lectura con OCR.'
        : scanResult.method === 'codigo'
          ? 'Se detecto el codigo de la INE, pero no se pudieron mapear campos utiles. Revisa el texto detectado o captura los datos manualmente.'
        : fieldsLabel
          ? `Datos obtenidos por OCR: ${fieldsLabel}. Puedes corregirlos antes de continuar.`
          : 'OCR completado. Captura manualmente los datos que no se hayan detectado.'
  } catch {
    emit('merge-fields', { ineScanStatus: 'pending' })
    scanMessage.value =
      'No fue posible leer la INE. Intenta con una imagen mas nitida o captura los datos manualmente.'
  } finally {
    scanning.value = false
  }
}
</script>

<template>
  <div class="step-fields">
    <transition name="ine-loading-fade">
      <div
        v-if="scanning"
        class="ine-loading-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ine-loading-title"
      >
        <div class="ine-loading-backdrop"></div>
        <div class="ine-loading-card">
          <span class="ine-loading-orb" aria-hidden="true"></span>
          <p class="eyebrow">Escaneo en proceso</p>
          <h3 id="ine-loading-title">Leyendo tu INE</h3>
          <p class="muted">
            Estamos analizando frente y reverso para detectar datos del documento.
          </p>
          <div class="ine-loading-progress" aria-hidden="true">
            <span></span>
          </div>
        </div>
      </div>
    </transition>

    <div v-if="props.form.identityValidationRequired" class="file-grid">
      <label class="file-card">
        <span>{{ props.form.documentType }} frente</span>
        <strong>{{ props.form.ineFrontName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="emit('file-selected', 'ineFront', $event)" />
      </label>

      <label class="file-card">
        <span>{{ props.form.documentType }} reverso</span>
        <strong>{{ props.form.ineBackName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="emit('file-selected', 'ineBack', $event)" />
      </label>
    </div>

    <button
      v-if="props.form.identityValidationRequired"
      type="button"
      class="scan-button"
      :disabled="scanning"
      @click="scanIne(props.form)"
    >
      {{ scanning ? 'Escaneando INE...' : 'Escanear datos de la INE' }}
    </button>

    <label>
      Nacionalidad
      <input
        :value="props.form.nationality"
        type="text"
        placeholder="Mexicana"
        @input="updateField('nationality', $event.target.value)"
      />
    </label>

    <div class="form-grid">
      <label>
        Identificacion
        <select
          :value="props.form.documentType"
          @change="updateField('documentType', $event.target.value)"
        >
          <option value="INE">INE</option>
          <option value="Pasaporte">Pasaporte</option>
        </select>
      </label>

      <label>
        Numero de documento
        <input
          :value="props.form.documentNumber"
          type="text"
          placeholder="Se llena al escanear"
          @input="updateField('documentNumber', $event.target.value)"
        />
      </label>

      <label>
        Vigencia
        <input
          :value="props.form.documentExpiration"
          type="date"
          @input="updateField('documentExpiration', $event.target.value)"
        />
        <small>Si no se detecta al escanear, puedes capturarla manualmente.</small>
      </label>

      <label class="checkbox-field">
        <input
          :checked="props.form.identityValidationRequired"
          type="checkbox"
          @change="updateField('identityValidationRequired', $event.target.checked)"
        />
        <span>Requiere validar identidad con foto del documento</span>
      </label>
    </div>

    <section class="scan-results">
      <p class="eyebrow">Datos detectados y editables</p>
      <div class="scan-result-grid">
        <label>
          Nombre completo
          <input
            :value="props.form.name"
            type="text"
            placeholder="Se completa al detectar nombre"
            @input="updateField('name', $event.target.value)"
          />
        </label>
        <label>
          Fecha de nacimiento
          <input
            :value="props.form.birthDate"
            type="date"
            @input="updateField('birthDate', $event.target.value)"
          />
        </label>
        <label>
          Nacionalidad
          <input
            :value="props.form.nationality"
            type="text"
            placeholder="Mexicana"
            @input="updateField('nationality', $event.target.value)"
          />
        </label>
        <label>
          Vigencia
          <input
            :value="props.form.documentExpiration"
            type="date"
            @input="updateField('documentExpiration', $event.target.value)"
          />
        </label>
        <label>
          Clave de elector
          <input
            :value="props.form.documentNumber"
            type="text"
            placeholder="Se completa al detectar clave"
            @input="updateField('documentNumber', $event.target.value)"
          />
        </label>
        <label>
          CURP
          <input
            :value="props.form.ineCurp"
            type="text"
            placeholder="Captura CURP si no se detecto"
            @input="updateField('ineCurp', $event.target.value)"
          />
        </label>
      </div>
      <p v-if="!hasDetectedEditableData(props.form) && !scanMessage" class="scan-message">
        Aun no hay datos detectados. Sube frente y reverso, despues presiona escanear.
      </p>
      <p v-if="scanMessage" class="scan-message">{{ scanMessage }}</p>
    </section>
  </div>
</template>
