<script setup>
import { computed, ref, watch } from 'vue'
import { api } from '../../lib/api'

const props = defineProps({
  operationId: { type: [String, Number], required: true },
  compact: Boolean,
  hideRefresh: Boolean,
})
const workflow = ref(null)
const loading = ref(false)
const error = ref(false)
const selected = ref(null)
const dialog = ref(null)
const failed = ref({})
const loaded = ref({})
const downloading = ref({})
const downloadError = ref('')
let request = 0
const labels = {
  catering_received: 'Catering',
  baggage_secured: 'Equipaje',
  cabin_condition: 'Cabina final',
}
const list = (value) =>
  Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : []
const slots = computed(() =>
  Object.entries(labels).map(([code, label]) => {
    const type = code === 'cabin_condition' ? 'postflight' : 'preflight'
    const checklist = list(workflow.value?.checklists)
      .filter((entry) => entry.type === type)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0]
    const item = list(checklist?.items).find((entry) => entry.code === code)
    return {
      code,
      label,
      files: list(item?.evidence_files)
        .filter((file) => file.file_path && file.storage_disk)
        .map((file, index) => {
          const raw = file.file_url || file.url || ''
          let url = ''
          try {
            const parsed = new URL(raw)
            if (['https:', 'http:'].includes(parsed.protocol)) url = raw
          } catch {
            /* Missing usable URL. */
          }
          const name =
            file.original_name || file.filename || file.file_path.split('/').pop() || 'Evidencia'
          const mime = String(file.file_type || file.mime_type || '').toLowerCase()
          return {
            ...file,
            key: `${code}-${index}`,
            label,
            name,
            url,
            image: mime ? mime.startsWith('image/') : /\.(jpe?g|png|webp|gif)$/i.test(name),
          }
        }),
    }
  }),
)
const count = computed(() => slots.value.filter((slot) => slot.files.length).length)
async function refresh() {
  const current = ++request
  const id = String(props.operationId || '')
  workflow.value = null
  selected.value = null
  dialog.value?.close()
  failed.value = {}
  loaded.value = {}
  error.value = false
  loading.value = true
  try {
    if (!id) throw new Error('Missing operation')
    const response = await api.get(`/admin/crew/operations/${encodeURIComponent(id)}/workflow`)
    if (current !== request) return
    if (String(response.operation_id) !== id) throw new Error('Operation mismatch')
    workflow.value = response
  } catch {
    if (current === request) error.value = true
  } finally {
    if (current === request) loading.value = false
  }
}
async function download(file) {
  downloading.value[file.key] = true
  downloadError.value = ''
  try {
    const response = await fetch(file.url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const extension =
      file.name.match(/\.(jpe?g|png|webp|gif|pdf)$/i)?.[1] || (file.image ? 'jpg' : 'bin')
    link.download = `${file.label}.${extension}`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    downloadError.value =
      'No se pudo descargar la evidencia. Puedes abrirla con Ver grande e intentar guardarla desde el visor.'
  } finally {
    downloading.value[file.key] = false
  }
}
defineExpose({ refresh, loading })
function open(file) {
  selected.value = file
  dialog.value.showModal()
}
watch(
  () => props.compact,
  () => {
    selected.value = null
    dialog.value?.close()
  },
)
watch(() => props.operationId, refresh, { immediate: true })
</script>

<template>
  <section class="closure-evidence" aria-label="Evidencias de cierre">
    <h4>
      Evidencias de cierre <span v-if="!loading && !error">{{ count }}/3</span>
    </h4>
    <p v-if="!compact">Operación #{{ operationId }}</p>
    <p v-if="!compact && !loading && !error">{{ count }}/3 evidencias cargadas</p>
    <p v-if="loading" role="status">Cargando evidencias…</p>
    <p v-else-if="error" role="alert">No se pudieron cargar las evidencias.</p>
    <ul v-else-if="compact" class="closure-summary">
      <li v-for="slot in slots" :key="slot.code">
        {{ slot.files.length ? '✓' : 'Pendiente ·' }} {{ slot.label }}
      </li>
    </ul>
    <div v-else class="closure-grid">
      <article v-for="slot in slots" :key="slot.code">
        <h5>{{ slot.label }}</h5>
        <p>{{ slot.files.length ? '✓ Cargada correctamente' : 'Pendiente' }}</p>
        <div v-for="file in slot.files" :key="file.key" class="closure-file">
          <template v-if="file.url && file.image && !failed[file.key]">
            <p v-if="!loaded[file.key]" role="status">Cargando imagen…</p>
            <img
              :src="file.url"
              :alt="file.label"
              @load="loaded[file.key] = true"
              @error="failed[file.key] = true"
            />
          </template>
          <p v-else>Vista previa no disponible</p>
          <a
            v-if="file.url"
            :href="file.url"
            target="_blank"
            rel="noopener noreferrer"
            @click="file.image && (open(file), $event.preventDefault())"
            >Ver grande</a
          >
          <button
            v-if="file.url"
            type="button"
            :disabled="downloading[file.key]"
            @click="download(file)"
          >
            {{ downloading[file.key] ? 'Descargando…' : 'Descargar' }}
          </button>
        </div>
      </article>
    </div>
    <p v-if="downloadError" role="alert">{{ downloadError }}</p>
    <button v-if="!hideRefresh && !compact" type="button" :disabled="loading" @click="refresh">
      Actualizar evidencias
    </button>
    <dialog ref="dialog" class="closure-dialog" @close="selected = null">
      <template v-if="selected">
        <h4>{{ selected.label }}</h4>
        <p>Operación #{{ operationId }}</p>
        <p v-if="selected.uploaded_at">{{ selected.uploaded_at }}</p>
        <template v-if="selected.image && !failed[`modal-${selected.key}`]">
          <p v-if="!loaded[`modal-${selected.key}`]" role="status">Cargando imagen…</p>
          <img
            :src="selected.url"
            :alt="selected.label"
            @load="loaded[`modal-${selected.key}`] = true"
            @error="failed[`modal-${selected.key}`] = true"
          />
        </template>
        <p v-else>Vista previa no disponible</p>
        <button type="button" autofocus @click="dialog.close()">Cerrar</button>
      </template>
    </dialog>
  </section>
</template>

<style scoped>
.closure-evidence {
  min-width: 0;
  padding: 16px 0;
}
h4,
h5 {
  margin: 0 0 10px;
  font-size: 1rem;
}
h4 span {
  margin-left: 12px;
}
.closure-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.closure-grid article {
  min-width: 0;
  border: 1px solid #dbe2ea;
  padding: 12px;
  border-radius: 12px;
}
.closure-file {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
  overflow-wrap: anywhere;
}
.closure-file img {
  width: 100%;
  height: 280px;
  object-fit: contain;
}
a,
button {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  background: #fff;
  color: inherit;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:hover {
  background: #f5f7fa;
}
button:focus-visible {
  outline: 2px solid #334155;
  outline-offset: 2px;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.closure-dialog {
  width: min(850px, calc(100vw - 32px));
  max-height: 90dvh;
  box-sizing: border-box;
  border: 0;
  border-radius: 16px;
  padding: 20px;
  overflow: auto;
  overflow-wrap: anywhere;
}
.closure-dialog::backdrop {
  background: #0009;
}
.closure-dialog img {
  display: block;
  width: 100%;
  max-height: 65dvh;
  object-fit: contain;
  margin-bottom: 16px;
}
@media (max-width: 1200px) {
  .closure-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 600px) {
  .closure-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.closure-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  list-style: none;
  padding: 0;
}
.closure-file a {
  color: #173b65;
  text-align: center;
  text-decoration: none;
  box-sizing: border-box;
}
</style>
