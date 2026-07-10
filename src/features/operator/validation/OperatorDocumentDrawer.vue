<script setup>
import { computed } from 'vue'
import {
  buildValidationStatusMeta,
  formatValidationDate,
  formatValidationFileSize,
} from '../../../lib/operatorValidationApi'

const props = defineProps({
  open: { type: Boolean, default: false },
  role: { type: String, default: 'provider' },
  document: { type: Object, default: null },
  versions: { type: Array, default: () => [] },
  activity: { type: Array, default: () => [] },
  loadingVersions: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'approve', 'reject', 'cancel', 'download', 'replace'])

const statusMeta = computed(() => buildValidationStatusMeta(props.document?.status))
const previewKind = computed(() => {
  const mime = String(props.document?.mimeType || '').toLowerCase()
  if (mime.includes('pdf')) return 'pdf'
  if (mime.startsWith('image/')) return 'image'
  return 'file'
})
const technicalItems = computed(() => {
  const details = props.document?.technicalDetails || {}
  return [
    { label: 'Version', value: details.version || props.document?.version || 1 },
    { label: 'Mime type', value: details.mimeType || props.document?.mimeType || 'Sin dato' },
    { label: 'Tamano', value: formatValidationFileSize(props.document?.size) },
    { label: 'Tipo tecnico', value: details.documentType || 'Sin dato' },
    { label: 'Slot', value: details.documentSlot || 'Sin dato' },
    { label: 'Categoria', value: details.documentCategory || 'Sin dato' },
    { label: 'Seccion', value: details.documentSection || 'Sin dato' },
  ]
})
</script>

<template>
  <div v-if="open && document" class="operator-document-drawer" @click.self="emit('close')">
    <aside class="operator-document-drawer__panel">
      <header class="operator-document-drawer__head">
        <div>
          <p class="operator-document-drawer__eyebrow">Detalle documental</p>
          <h3>{{ document.definitionLabel || document.name }}</h3>
          <p>{{ document.fileName || document.originalName }}</p>
        </div>
        <button type="button" class="ghost-button" @click="emit('close')">Cerrar</button>
      </header>

      <div class="operator-document-drawer__body">
        <section class="operator-document-drawer__preview">
          <span class="status-pill" :data-tone="statusMeta.tone">{{ statusMeta.label }}</span>
          <iframe v-if="previewKind === 'pdf' && document.fileUrl" :src="document.fileUrl" title="Vista previa PDF"></iframe>
          <img v-else-if="previewKind === 'image' && document.fileUrl" :src="document.fileUrl" :alt="document.fileName || document.definitionLabel" />
          <div v-else class="operator-document-drawer__preview-empty">
            <strong>Vista previa no disponible</strong>
            <p>Usa Descargar para abrir el archivo con la ruta expuesta por backend.</p>
          </div>
        </section>

        <section class="operator-document-drawer__grid">
          <article class="operator-document-drawer__card">
            <h4>Resumen</h4>
            <div class="info-list">
              <div><span>Fecha de carga</span><strong>{{ formatValidationDate(document.uploadedAt) }}</strong></div>
              <div><span>Fecha de revision</span><strong>{{ formatValidationDate(document.reviewedAt) }}</strong></div>
              <div><span>Revisado por</span><strong>{{ document.reviewedBy || 'Sin asignar' }}</strong></div>
              <div><span>Motivo rechazo</span><strong>{{ document.rejectionReason || 'Sin motivo registrado' }}</strong></div>
            </div>
          </article>

          <article class="operator-document-drawer__card">
            <h4>Informacion tecnica</h4>
            <div class="info-list">
              <div v-for="item in technicalItems" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>
          </article>
        </section>

        <article class="operator-document-drawer__card">
          <h4>Versiones</h4>
          <p v-if="loadingVersions" class="muted">Cargando versiones...</p>
          <div v-else class="version-list">
            <div v-for="version in versions" :key="version.id || `${version.definitionKey}-${version.version}`" class="version-item">
              <strong>v{{ version.version || 1 }}</strong>
              <span>{{ formatValidationDate(version.uploadedAt) }}</span>
              <span>{{ buildValidationStatusMeta(version.status).label }}</span>
            </div>
            <p v-if="!versions.length" class="muted">No hay historial de versiones visible.</p>
          </div>
        </article>

        <article class="operator-document-drawer__card">
          <h4>Historial</h4>
          <div class="activity-list">
            <div v-for="entry in activity" :key="entry.id" class="activity-item">
              <strong>{{ entry.title }}</strong>
              <span>{{ formatValidationDate(entry.createdAt) }}</span>
              <p>{{ entry.description || 'Sin detalle adicional.' }}</p>
            </div>
            <p v-if="!activity.length" class="muted">No hay actividad registrada para este documento.</p>
          </div>
        </article>
      </div>

      <footer class="operator-document-drawer__actions">
        <button type="button" class="ghost-button" @click="emit('download', document)">Descargar</button>
        <button v-if="role === 'provider'" type="button" class="ghost-button" @click="emit('replace', document)">
          Reemplazar
        </button>
        <button v-if="role === 'admin'" type="button" class="ghost-button success" @click="emit('approve', document)">
          Aprobar
        </button>
        <button v-if="role === 'admin'" type="button" class="ghost-button warning" @click="emit('reject', document)">
          Rechazar
        </button>
        <button v-if="role === 'admin'" type="button" class="ghost-button danger" @click="emit('cancel', document)">
          Cancelar
        </button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.operator-document-drawer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: rgba(12, 25, 39, 0.34);
  backdrop-filter: blur(8px);
}

.operator-document-drawer__panel {
  width: min(720px, 100%);
  height: 100%;
  overflow: auto;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 245, 240, 0.98));
  box-shadow: -20px 0 48px rgba(18, 40, 59, 0.14);
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.operator-document-drawer__head,
.operator-document-drawer__actions {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.operator-document-drawer__eyebrow {
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  font-weight: 700;
  color: #5f87c7;
}

.operator-document-drawer__head h3,
.operator-document-drawer__head p,
.operator-document-drawer__card h4 {
  margin: 0;
  color: #15324d;
}

.operator-document-drawer__head p {
  margin-top: 8px;
  color: #6f8096;
}

.operator-document-drawer__body {
  padding: 0 24px 24px;
  display: grid;
  gap: 18px;
}

.operator-document-drawer__preview,
.operator-document-drawer__card {
  padding: 18px;
  border-radius: 22px;
  border: 1px solid rgba(21, 50, 77, 0.08);
  background: rgba(255, 255, 255, 0.92);
}

.operator-document-drawer__preview iframe,
.operator-document-drawer__preview img {
  width: 100%;
  min-height: 320px;
  margin-top: 14px;
  border: 0;
  border-radius: 16px;
  object-fit: cover;
  background: #f5f7fb;
}

.operator-document-drawer__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.info-list,
.activity-list,
.version-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.info-list div,
.version-item,
.activity-item {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(21, 50, 77, 0.08);
}

.info-list div:last-child,
.version-item:last-child,
.activity-item:last-child {
  border-bottom: 0;
}

.info-list span,
.version-item span,
.activity-item span,
.muted {
  color: #6f8096;
}

.ghost-button {
  border: 1px solid rgba(21, 50, 77, 0.12);
  background: rgba(255, 255, 255, 0.95);
  color: #15324d;
  border-radius: 999px;
  padding: 10px 14px;
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

.status-pill {
  display: inline-flex;
  width: fit-content;
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

@media (max-width: 900px) {
  .operator-document-drawer__grid {
    grid-template-columns: 1fr;
  }

  .operator-document-drawer__actions {
    flex-wrap: wrap;
  }
}
</style>
