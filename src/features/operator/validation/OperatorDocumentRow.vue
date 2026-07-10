<script setup>
import { computed } from 'vue'
import {
  buildValidationStatusMeta,
  formatValidationDate,
  formatValidationFileSize,
} from '../../../lib/operatorValidationApi'

const props = defineProps({
  document: { type: Object, required: true },
  role: { type: String, default: 'provider' },
  approving: { type: Boolean, default: false },
  rejecting: { type: Boolean, default: false },
  cancelling: { type: Boolean, default: false },
})

const emit = defineEmits(['view', 'download', 'approve', 'reject', 'cancel', 'replace'])

const statusMeta = computed(() => buildValidationStatusMeta(props.document?.status))
const canAdmin = computed(() => props.role === 'admin')
const canProvider = computed(() => props.role === 'provider')
const hasDocumentFile = computed(() => Boolean(props.document?.fileUrl || props.document?.downloadUrl || props.document?.fileName))
</script>

<template>
  <article class="operator-document-row">
    <div class="operator-document-row__main">
      <div class="operator-document-row__identity">
        <strong>{{ document.definitionLabel || document.name || 'Documento' }}</strong>
        <p>{{ document.fileName || document.originalName || 'Sin archivo actual' }}</p>
      </div>

      <div class="operator-document-row__meta">
        <span>{{ document.visibleType || 'Documento' }}</span>
        <span>{{ formatValidationFileSize(document.visibleSize || document.size) }}</span>
        <span>{{ formatValidationDate(document.visibleDate || document.uploadedAt) }}</span>
      </div>

      <div class="operator-document-row__state">
        <span class="status-pill" :data-tone="statusMeta.tone">{{ statusMeta.label }}</span>
      </div>
    </div>

    <div class="operator-document-row__actions">
      <button type="button" class="ghost-button" :disabled="!hasDocumentFile" @click="emit('view', document)">Ver</button>
      <button type="button" class="ghost-button" :disabled="!hasDocumentFile" @click="emit('download', document)">Descargar</button>
      <button v-if="canProvider" type="button" class="ghost-button" @click="emit('replace', document)">
        {{ hasDocumentFile ? 'Reemplazar' : 'Subir' }}
      </button>
      <button
        v-if="canAdmin"
        type="button"
        class="ghost-button success"
        :disabled="approving"
        @click="emit('approve', document)"
      >
        {{ approving ? 'Aprobando...' : 'Aprobar' }}
      </button>
      <button
        v-if="canAdmin"
        type="button"
        class="ghost-button warning"
        :disabled="rejecting"
        @click="emit('reject', document)"
      >
        {{ rejecting ? 'Guardando...' : 'Rechazar' }}
      </button>
      <button
        v-if="canAdmin"
        type="button"
        class="ghost-button danger"
        :disabled="cancelling"
        @click="emit('cancel', document)"
      >
        {{ cancelling ? 'Cancelando...' : 'Cancelar' }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.operator-document-row {
  display: grid;
  gap: 14px;
  padding: 16px 18px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 246, 241, 0.96));
}

.operator-document-row__main {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.operator-document-row__identity strong,
.operator-document-row__meta,
.operator-document-row__identity p {
  color: #15324d;
}

.operator-document-row__identity p,
.operator-document-row__meta span {
  margin: 4px 0 0;
  font-size: 0.92rem;
  color: #6f8096;
}

.operator-document-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.operator-document-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
}

.status-pill[data-tone='success'] {
  background: #e7f7ee;
  color: #2f9a6c;
}

.status-pill[data-tone='warning'] {
  background: #fff4df;
  color: #de9b29;
}

.status-pill[data-tone='danger'] {
  background: #feebe6;
  color: #dc7a68;
}

.status-pill[data-tone='info'] {
  background: #e8f0fd;
  color: #5f87c7;
}

.ghost-button {
  border: 1px solid rgba(21, 50, 77, 0.12);
  background: rgba(255, 255, 255, 0.95);
  color: #15324d;
  border-radius: 999px;
  padding: 9px 14px;
}

.ghost-button.success {
  color: #2f9a6c;
}

.ghost-button.warning {
  color: #de9b29;
}

.ghost-button.danger {
  color: #dc7a68;
}

@media (max-width: 900px) {
  .operator-document-row__main {
    grid-template-columns: 1fr;
  }
}
</style>
