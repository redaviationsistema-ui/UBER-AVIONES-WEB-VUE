<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { canvasToFile, captureVideoFrame } from './identityVerification'
import { scanIneFiles } from './ineScanner'
import { api } from '../../lib/api'

const props = defineProps({
  form: { type: Object, required: true },
})

const emit = defineEmits(['file-selected', 'update-field', 'merge-fields'])

const cameraLoading = ref(false)
const capturing = ref(false)
const validating = ref(false)
const scanning = ref(false)
const cameraActive = ref(false)
const videoRef = ref(null)
const activeStream = ref(null)
const cameraStatus = ref('')
const verificationMessage = ref('')
const scanMessage = ref('')
const BIOMETRIC_DETECT_FACE_PATH = String(
  import.meta.env.VITE_BIOMETRIC_DETECT_FACE_PATH || '/public/biometric/detect-face',
).trim()

function revokePreviewUrl(url) {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const flowSteps = computed(() => [
  { number: 1, label: 'Abrir camara', complete: cameraActive.value || Boolean(props.form.selfiePreviewUrl) },
  { number: 2, label: 'Capturar selfie', complete: Boolean(props.form.selfieFile) },
  { number: 3, label: 'Mostrar preview', complete: Boolean(props.form.selfiePreviewUrl) },
  {
    number: 4,
    label: 'Validar rostro',
    complete: ['pending_backend_validation', 'approved', 'rejected'].includes(
      String(props.form.identityVerificationStatus || '').trim(),
    ),
  },
  {
    number: 5,
    label: 'Mostrar resultado',
    complete: ['approved', 'rejected'].includes(String(props.form.identityVerificationStatus || '').trim()),
  },
])

const responseState = computed(() => {
  const status = String(props.form.identityVerificationStatus || '').trim()

  if (status === 'approved') {
    return {
      label: 'Aprobado',
      detail: props.form.identityVerificationMessage || 'El backend aprobo la selfie enviada.',
      tone: 'validated',
    }
  }

  if (status === 'rejected' || status === 'capture_rejected') {
    return {
      label: 'Rechazado',
      detail:
        props.form.identityVerificationMessage ||
        'El backend rechazo la selfie o la captura no fue valida.',
      tone: 'searching',
    }
  }

  if (status === 'selfie_captured' || status === 'pending_backend_validation') {
    return {
      label: status === 'pending_backend_validation' ? 'Validando' : 'Selfie capturada',
      detail:
        props.form.identityVerificationMessage ||
        'La selfie se esta validando en backend.',
      tone: 'pending-review',
    }
  }

  return {
    label: 'Pendiente',
    detail: 'Abre la camara y captura una selfie para que el registro la envie al backend.',
    tone: 'searching',
  }
})

function updateField(field, value) {
  if (field === 'name') {
    emit('update-field', field, String(value || '').toUpperCase())
    return
  }

  emit('update-field', field, value)
}

function handleIneFileSelected(field, event) {
  emit('file-selected', field, event)
  scanMessage.value = ''
  emit('merge-fields', {
    ineScanStatus: '',
    ineScanRaw: '',
    ineCurp: '',
    ineCic: '',
    ineOcr: '',
    documentNumber: '',
    documentExpiration: '',
  })
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

function resetBiometricCapture(message = '') {
  verificationMessage.value = message
  cameraStatus.value = ''
  revokePreviewUrl(props.form.selfiePreviewUrl)
  emit('merge-fields', {
    selfieFile: null,
    selfieFileName: '',
    selfiePreviewUrl: '',
    identityVerificationStatus: '',
    identityVerificationMessage: message,
    identityVerified: false,
    faceDetected: false,
    faceMatchScore: null,
    livenessScore: null,
    imageStorageScore: 0,
    biometricImageSaved: false,
    biometricCapturedAt: '',
    biometricProvider: '',
    biometricTemplateType: '',
    facesCount: 0,
    faceConfidence: null,
    qualityBrightness: null,
    qualitySharpness: null,
    poseYaw: null,
    posePitch: null,
    poseRoll: null,
    faceOccluded: null,
  })
}

function applyBiometricValidationResult(result = {}, file, previewUrl) {
  const quality = result.quality && typeof result.quality === 'object' ? result.quality : {}
  const pose = result.pose && typeof result.pose === 'object' ? result.pose : {}

  emit('merge-fields', {
    selfieFile: file,
    selfieFileName: file?.name || '',
    selfiePreviewUrl: previewUrl,
    identityVerificationStatus: result.identityVerificationStatus || '',
    identityVerificationMessage: result.message || '',
    identityVerified: Boolean(result.identityVerified),
    faceDetected: Boolean(result.faceDetected),
    faceMatchScore: null,
    livenessScore: null,
    imageStorageScore: Boolean(result.biometricImageSaved) ? 100 : 0,
    biometricImageSaved: Boolean(result.biometricImageSaved),
    biometricCapturedAt: new Date().toISOString(),
    biometricProvider: result.biometricProvider || 'aws_rekognition',
    biometricTemplateType: result.biometricTemplateType || 'selfie-photo',
    facesCount: Number(result.facesCount || 0),
    faceConfidence:
      result.faceConfidence === undefined || result.faceConfidence === null
        ? null
        : Number(result.faceConfidence),
    qualityBrightness:
      quality.brightness === undefined || quality.brightness === null
        ? null
        : Number(quality.brightness),
    qualitySharpness:
      quality.sharpness === undefined || quality.sharpness === null
        ? null
        : Number(quality.sharpness),
    poseYaw: pose.yaw === undefined || pose.yaw === null ? null : Number(pose.yaw),
    posePitch: pose.pitch === undefined || pose.pitch === null ? null : Number(pose.pitch),
    poseRoll: pose.roll === undefined || pose.roll === null ? null : Number(pose.roll),
    faceOccluded:
      result.faceOccluded === undefined || result.faceOccluded === null
        ? null
        : Boolean(result.faceOccluded),
  })
}

async function validateCapturedSelfie(file, previewUrl) {
  validating.value = true
  cameraStatus.value = 'Validando rostro...'

  try {
    const formData = new FormData()
    formData.append('selfie', file)

    const result = await api.postForm(BIOMETRIC_DETECT_FACE_PATH, formData, {
      timeoutMs: 45000,
      preserveAuthOnUnauthorized: true,
    })

    applyBiometricValidationResult(result, file, previewUrl)
    verificationMessage.value = result.message || ''
    cameraStatus.value = result.identityVerified
      ? 'Rostro validado correctamente.'
      : 'La selfie fue analizada pero no quedo aprobada.'
  } catch (error) {
    const rejectionMessage =
      error?.status === 401
        ? 'La validacion del rostro fue rechazada por el backend.'
        : error?.payload?.message || error?.message || 'No se pudo validar el rostro.'

    applyBiometricValidationResult(
      {
        message: rejectionMessage,
        identityVerified: false,
        identityVerificationStatus: 'rejected',
        biometricProvider: 'aws_rekognition',
        biometricTemplateType: 'selfie-photo',
        biometricImageSaved: true,
        faceDetected: false,
        facesCount: 0,
        faceConfidence: null,
        faceOccluded: null,
      },
      file,
      previewUrl,
    )
    verificationMessage.value = rejectionMessage
    cameraStatus.value = 'Validacion rechazada. Captura una nueva selfie.'
  } finally {
    validating.value = false
  }
}

async function startCamera() {
  cameraLoading.value = true
  verificationMessage.value = ''
  cameraStatus.value = 'Abriendo camara...'

  try {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Este dispositivo no permite abrir la camara desde el navegador.')
    }

    stopCamera()

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    activeStream.value = stream
    cameraActive.value = true

    await nextTick()

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
    }

    cameraStatus.value = 'Camara lista. Toma tu selfie.'
  } catch (error) {
    cameraActive.value = false
    verificationMessage.value =
      error?.name === 'NotAllowedError'
        ? 'Necesitamos permiso de camara para registrar la selfie.'
        : error?.message || 'No fue posible abrir la camara.'
  } finally {
    cameraLoading.value = false
  }
}

function stopCamera() {
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.srcObject = null
  }

  activeStream.value?.getTracks?.().forEach((track) => track.stop())
  activeStream.value = null
  cameraActive.value = false
}

async function captureBiometricSelfie() {
  if (!videoRef.value || !cameraActive.value) {
    verificationMessage.value = 'Abre la camara antes de capturar la selfie.'
    return
  }

  capturing.value = true
  verificationMessage.value = ''

  try {
    const canvas = captureVideoFrame(videoRef.value)
    const file = await canvasToFile(canvas, 'selfie-biometrica.jpg')

    revokePreviewUrl(props.form.selfiePreviewUrl)

    const previewUrl = canvas.toDataURL('image/jpeg', 0.92)
    emit('merge-fields', {
      selfieFile: file,
      selfieFileName: file.name,
      selfiePreviewUrl: previewUrl,
      identityVerificationStatus: 'pending_backend_validation',
      identityVerificationMessage: 'Selfie capturada. Validando rostro...',
      identityVerified: false,
      faceDetected: false,
      faceMatchScore: null,
      livenessScore: null,
      imageStorageScore: 100,
      biometricImageSaved: true,
      biometricCapturedAt: new Date().toISOString(),
      biometricProvider: 'camera_capture',
      biometricTemplateType: 'selfie-photo',
    })

    cameraStatus.value = 'Preview lista. Enviando selfie a validacion.'
    await validateCapturedSelfie(file, previewUrl)
  } catch (error) {
    resetBiometricCapture(error?.message || 'No pudimos capturar la selfie desde la camara.')
  } finally {
    capturing.value = false
  }
}

onBeforeUnmount(() => {
  stopCamera()
  revokePreviewUrl(props.form.selfiePreviewUrl)
})
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

    <div class="file-grid">
      <label class="file-card">
        <span>{{ props.form.documentType }} frente</span>
        <strong>{{ props.form.ineFrontName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="handleIneFileSelected('ineFront', $event)" />
      </label>

      <label class="file-card">
        <span>{{ props.form.documentType }} reverso</span>
        <strong>{{ props.form.ineBackName || 'Subir archivo' }}</strong>
        <input type="file" accept="image/*" @change="handleIneFileSelected('ineBack', $event)" />
      </label>
    </div>

    <button
      type="button"
      class="scan-button"
      :disabled="scanning || props.form.documentType !== 'INE'"
      @click="scanIne(props.form)"
    >
      {{ scanning ? 'Escaneando INE...' : 'Escanear datos de la INE' }}
    </button>

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

    <section class="verification-panel">
      <div class="verification-head">
        <div>
          <p class="eyebrow">Registro biometrico</p>
        </div>
        <strong
          class="verification-badge"
          :class="responseState.tone === 'validated' ? 'is-success' : 'is-pending'"
        >
          {{ responseState.label }}
        </strong>
      </div>

      <div class="verification-steps">
        <span
          v-for="step in flowSteps"
          :key="step.number"
          class="verification-step-chip"
          :class="{ complete: step.complete }"
        >
          {{ step.number }}. {{ step.label }}
        </span>
      </div>

      <div class="camera-grid">
        <div class="camera-stage">
          <div v-if="cameraActive" class="camera-frame">
            <div class="camera-live-pill">Live</div>
            <video ref="videoRef" playsinline muted autoplay></video>
          </div>

          <div v-else class="camera-placeholder">
            <strong>Validacion facial</strong>
            <span>
              Abrimos la camara del navegador, capturamos la selfie y la enviamos al backend al
              completar el registro. No instalamos nada extra.
            </span>
          </div>

          <div class="camera-actions">
            <button
              v-if="!cameraActive"
              type="button"
              class="secondary-button"
              :disabled="cameraLoading"
              @click="startCamera"
            >
              {{ cameraLoading ? 'Abriendo camara...' : 'Abrir camara' }}
            </button>

            <button
              v-if="cameraActive"
              type="button"
              class="primary-button"
              :disabled="capturing || validating"
              @click="captureBiometricSelfie"
            >
              {{ capturing ? 'Capturando selfie...' : validating ? 'Validando rostro...' : 'Capturar selfie' }}
            </button>

            <button
              v-if="cameraActive"
              type="button"
              class="secondary-button"
              :disabled="capturing || validating"
              @click="stopCamera"
            >
              Cerrar camara
            </button>

            <button
              v-if="props.form.selfieFile"
              type="button"
              class="secondary-button"
              :disabled="capturing || validating"
              @click="resetBiometricCapture('Selfie eliminada. Puedes capturar una nueva imagen.')"
            >
              Quitar selfie
            </button>
          </div>

          <p v-if="cameraStatus" class="scan-message">{{ cameraStatus }}</p>
          <p class="scan-message">
            La selfie se valida de inmediato contra el backend al momento de capturarla.
          </p>
        </div>

        <div class="verification-summary">
          <div class="summary-headline">
            <p class="eyebrow">Respuesta</p>
            <h4>Estado del backend</h4>
          </div>

          <article
            class="score-card"
            :class="['status-card', responseState.tone, { active: Boolean(props.form.selfiePreviewUrl) }]"
          >
            <span>Estado</span>
            <strong>{{ responseState.label }}</strong>
            <small>{{ responseState.detail }}</small>
          </article>

          <article v-if="props.form.faceConfidence !== null" class="score-card">
            <span>Confianza facial</span>
            <strong>{{ props.form.faceConfidence }}%</strong>
            <small>
              {{ props.form.facesCount || 0 }} rostro detectado, oclusion:
              {{ props.form.faceOccluded === null ? 'sin dato' : props.form.faceOccluded ? 'si' : 'no' }}.
            </small>
          </article>

          <article
            v-if="props.form.qualityBrightness !== null || props.form.qualitySharpness !== null"
            class="score-card"
          >
            <span>Calidad</span>
            <strong>
              {{ props.form.qualityBrightness ?? '-' }} / {{ props.form.qualitySharpness ?? '-' }}
            </strong>
            <small>Brightness / Sharpness reportados por el proveedor biometrico.</small>
          </article>

          <article
            v-if="props.form.poseYaw !== null || props.form.posePitch !== null || props.form.poseRoll !== null"
            class="score-card"
          >
            <span>Pose</span>
            <strong>
              {{ props.form.poseYaw ?? '-' }} / {{ props.form.posePitch ?? '-' }} / {{ props.form.poseRoll ?? '-' }}
            </strong>
            <small>Yaw / Pitch / Roll detectados en la selfie validada.</small>
          </article>

          <div v-if="props.form.selfiePreviewUrl" class="selfie-preview-card">
            <span>Preview de la selfie</span>
            <img :src="props.form.selfiePreviewUrl" alt="Preview de selfie seleccionada" />
          </div>

          <p v-if="verificationMessage || props.form.identityVerificationMessage" class="scan-message">
            {{ verificationMessage || props.form.identityVerificationMessage }}
          </p>
        </div>
      </div>

    </section>
  </div>
</template>
