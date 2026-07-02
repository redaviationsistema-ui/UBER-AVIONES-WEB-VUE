<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../../lib/api'
import { useUiStore } from '../../stores/ui'

const ui = useUiStore()

function formatTableLabel(name) {
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
 // checrar el flujo de contrato 
const tableMetadata = {
  aircraft: 'Catalogo principal de aeronaves.',
  aircraft_availability: 'Disponibilidad operativa de aeronaves.',
  aircraft_documents: 'Documentos y vigencias de aeronaves.',
  aircraft_images: 'Galeria y fotos de aeronaves.',
  airports: 'Aeropuertos, codigos y metadatos de operacion. Si tu archivo trae `icao_code`,  lo convertira a `icao` automaticamente.',
  anti_broker_flags: 'Alertas de seguridad y anti broker.',
  attachments: 'Archivos adjuntos del sistema.',
  audit_logs: 'Bitacora de auditoria.',
  chat_messages: 'Mensajes del chat protegido.',
  checklist_items: 'Items de cada checklist.',
  checklists: 'Checklists operativos.',
  commissions: 'Comisiones comerciales.',
  demos: 'Leads o solicitudes demo.',
  favorite_aircraft: 'Favoritos por usuario.',
  flight_request_legs: 'Tramos de solicitudes de vuelo.',
  flight_requests: 'Solicitudes de vuelo del marketplace.',
  login_attempts: 'Intentos de acceso.',
  notifications: 'Notificaciones del sistema.',
  operation_timeline: 'Linea de tiempo operativa.',
  operations: 'Operaciones activas .',
  payment_methods: 'Metodos de pago disponibles.',
  payments: 'Pagos de clientes.',
  payouts: 'Pagos a proveedores.',
  plans: 'Planes comerciales.',
  profiles: 'Perfiles extendidos de usuarios.',
  protected_chats: 'Canales de chat protegidos.',
  providers: 'Red de proveedores.',
  quote_items: 'Conceptos dentro de una cotizacion.',
  quotes: 'Cotizaciones emitidas.',
  request_matches: 'Coincidencias entre solicitud y oferta.',
  reservation_legs: 'Tramos de reservas confirmadas.',
  reservations: 'Reservas consolidadas.',
  sobrecargo_assignments: 'Asignaciones de sobrecargo.',
  subscriptions: 'Suscripciones activas y empresariales.',
  support_ticket_messages: 'Mensajes de tickets de soporte.',
  support_tickets: 'Tickets de soporte.',
  system_settings: 'Configuraciones centrales.',
  users: 'Usuarios y accesos del sistema.',
  verification_codes: 'Codigos de verificacion.',
  webhook_events: 'Eventos recibidos por webhook.',
}

function buildTable(table) {
  return {
    id: table.name,
    name: table.name,
    label: formatTableLabel(table.name),
    description: tableMetadata[table.name] || `Tabla real detectada en la conexion ${table.name}.`,
    columns: table.columns?.length ? table.columns : ['id', 'created_at', 'updated_at'],
  }
}

const databaseTargets = [
  {
    id: 'pgsql',
    connection: 'pgsql',
    label: 'PostgreSQL principal',
    database: 'uber_aviones_8hk9',
    engine: 'PostgreSQL',
    host: 'dpg-d7nrn4m7r5hc73b2ihag-a.oregon-postgres.render.com',
    status: 'Activa',
    detail: 'Conexion activa. Las tablas se consultan en vivo desde el API.',
  },
  {
    id: 'sqlite',
    connection: 'sqlite',
    label: 'SQLite local',
    database: 'database.sqlite',
    engine: 'SQLite',
    host: 'database/database.sqlite',
    status: 'Disponible',
    detail: 'Si se la expone, sus tablas se consultan en vivo desde el API.',
  },
  {
    id: 'sqlite-test',
    connection: 'sqlite-test',
    label: 'SQLite pruebas',
    database: 'test.sqlite',
    engine: 'SQLite',
    host: 'database/test.sqlite',
    status: 'Disponible',
    detail: 'Si se la expone, sus tablas se consultan en vivo desde el API.',
  },
]

const selectedDatabaseId = ref(databaseTargets[0].id)
const selectedSourceId = ref('')
const importMode = ref('append')
const exportFormat = ref('xlsx')
const selectedFile = ref(null)
const isImporting = ref(false)
const isExporting = ref(false)
const isLoadingSchema = ref(false)
const schemaError = ref('')
const importError = ref(null)
const jobs = ref([])
const tablesByConnection = ref({})

const selectedDatabase = computed(
  () => databaseTargets.find((item) => item.id === selectedDatabaseId.value) || databaseTargets[0],
)

const availableTables = computed(() => tablesByConnection.value[selectedDatabase.value.connection] || [])

const selectedSource = computed(
  () => availableTables.value.find((item) => item.id === selectedSourceId.value) || availableTables.value[0],
)

watch(selectedDatabaseId, () => {
  loadSchema()
})

onMounted(() => {
  loadSchema()
})

function registerJob(job) {
  jobs.value = [job, ...jobs.value].slice(0, 6)
}

function normalizeErrorMessage(error, fallbackMessage) {
  const payload = error?.payload || {}
  const parts = []

  if (payload.message || error?.message) {
    parts.push(payload.message || error.message)
  }

  if (Array.isArray(payload.missing_columns) && payload.missing_columns.length) {
    parts.push(`Columnas faltantes: ${payload.missing_columns.join(', ')}`)
  }

  if (payload.detail) {
    parts.push(payload.detail)
  }

  return parts.filter(Boolean).join(' ') || fallbackMessage
}

function humanizeBackendError(error) {
  const payload = error?.payload || {}
  const detail = payload.detail || ''
  const message = payload.message || error?.message || 'No fue posible procesar el archivo.'
  const missingColumns = Array.isArray(payload.missing_columns) ? payload.missing_columns : []

  const notNullMatch = detail.match(/null value in column "([^"]+)"/i)
  if (notNullMatch?.[1]) {
    return {
      title: 'Falta una columna obligatoria',
      summary: `La base de datos requiere la columna "${notNullMatch[1]}" y el archivo enviado no la lleno correctamente.`,
      missingColumns: missingColumns.length ? missingColumns : [notNullMatch[1]],
      detail,
    }
  }

  if (/duplicate key value violates unique constraint/i.test(detail)) {
    return {
      title: 'Hay datos duplicados',
      summary: 'La importacion contiene valores que ya existen en una columna unica de la base de datos.',
      missingColumns,
      detail,
    }
  }

  return {
    title: 'No se pudo importar',
    summary: normalizeErrorMessage(error, message),
    missingColumns,
    detail,
  }
}

function handleFileSelection(event) {
  const [file] = event.target.files || []
  selectedFile.value = file || null
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}

async function loadSchema() {
  const connection = selectedDatabase.value.connection
  isLoadingSchema.value = true
  schemaError.value = ''

  try {
    const response = await api.get('/admin/data-transfer/schema', {
      query: { connection },
    })

    const tables = (response.tables || []).map(buildTable)
    tablesByConnection.value = {
      ...tablesByConnection.value,
      [connection]: tables,
    }
    selectedSourceId.value = tables[0]?.id || ''
  } catch (error) {
    tablesByConnection.value = {
      ...tablesByConnection.value,
      [connection]: [],
    }
    selectedSourceId.value = ''
    schemaError.value =
      error.message || 'No fue posible consultar las tablas reales de esta conexion.'
    ui.pushToast({
      tone: 'warning',
      title: 'No se pudo cargar el esquema',
      message: schemaError.value,
    })
  } finally {
    isLoadingSchema.value = false
  }
}

function downloadTemplate() {
  if (!selectedSource.value) return

  const headers = selectedSource.value.columns.join(',')
  const sampleRow = selectedSource.value.columns.map(() => '').join(',')
  const fileName = `${selectedSource.value.name}-plantilla.csv`
  const blob = new Blob([`${headers}\n${sampleRow}\n`], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, fileName)

  ui.pushToast({
    tone: 'success',
    title: 'Plantilla descargada',
    message: `Se genero la plantilla para la tabla ${selectedSource.value.name}.`,
  })
}

async function submitImport() {
  importError.value = null

  if (!selectedSource.value) {
    ui.pushToast({
      tone: 'warning',
      title: 'Tabla requerida',
      message: 'Selecciona una tabla real valida antes de importar.',
    })
    return
  }

  if (!selectedFile.value) {
    ui.pushToast({
      tone: 'warning',
      title: 'Archivo requerido',
      message: 'Selecciona un archivo .xlsx, .xls o .csv antes de importar.',
    })
    return
  }

  const formData = new FormData()
  formData.append('file', selectedFile.value)
  formData.append('resource', selectedSource.value.name)
  formData.append('mode', importMode.value)
  formData.append('connection', selectedDatabase.value.connection)

  isImporting.value = true

  try {
    const response = await api.postForm('/admin/data-transfer/import', formData)
    const summary = response.summary || response.data || {}

    registerJob({
      id: `${Date.now()}-import`,
      type: 'Importacion',
      resource: `${selectedDatabase.value.database}.${selectedSource.value.name}`,
      status: 'Completada',
      detail: summary.message || `${selectedFile.value.name} cargado correctamente.`,
    })

    ui.pushToast({
      tone: 'success',
      title: 'Importacion completada',
      message:
        summary.message ||
        `Se proceso ${selectedFile.value.name} en ${selectedDatabase.value.database}.${selectedSource.value.name}.`,
    })

    selectedFile.value = null
  } catch (error) {
    const fullMessage = normalizeErrorMessage(
      error,
      'No fue posible procesar el archivo para la tabla seleccionada.',
    )
    const humanized = humanizeBackendError(error)

    importError.value = {
      title: humanized.title,
      message: humanized.summary,
      missingColumns: humanized.missingColumns,
      detail: humanized.detail,
      fullMessage,
    }

    registerJob({
      id: `${Date.now()}-import-error`,
      type: 'Importacion',
      resource: `${selectedDatabase.value.database}.${selectedSource.value.name}`,
      status: 'Fallida',
      detail: fullMessage,
    })

    ui.pushToast({
      tone: 'danger',
      title: humanized.title,
      message: humanized.summary,
    })
  } finally {
    isImporting.value = false
  }
}

async function exportData() {
  if (!selectedSource.value) {
    ui.pushToast({
      tone: 'warning',
      title: 'Tabla requerida',
      message: 'Selecciona una tabla real valida antes de exportar.',
    })
    return
  }

  isExporting.value = true

  try {
    const response = await api.download('/admin/data-transfer/export', {
      query: {
        resource: selectedSource.value.name,
        format: exportFormat.value,
        connection: selectedDatabase.value.connection,
      },
    })

    const date = new Date().toISOString().slice(0, 10)
    const fallbackName = `${selectedSource.value.name}-${date}.${exportFormat.value}`
    downloadBlob(response.blob, response.fileName || fallbackName)

    registerJob({
      id: `${Date.now()}-export`,
      type: 'Exportacion',
      resource: `${selectedDatabase.value.database}.${selectedSource.value.name}`,
      status: 'Completada',
      detail: `Archivo ${exportFormat.value.toUpperCase()} generado correctamente.`,
    })

    ui.pushToast({
      tone: 'success',
      title: 'Exportacion lista',
      message: `Se descargo la tabla ${selectedSource.value.name} en formato ${exportFormat.value.toUpperCase()}.`,
    })
  } catch (error) {
    registerJob({
      id: `${Date.now()}-export-error`,
      type: 'Exportacion',
      resource: `${selectedDatabase.value.database}.${selectedSource.value.name}`,
      status: 'Fallida',
      detail: error.message || 'No fue posible generar el archivo.',
    })

    ui.pushToast({
      tone: 'danger',
      title: 'No se pudo exportar',
      message: error.message || 'No fue posible exportar la tabla seleccionada.',
    })
  } finally {
    isExporting.value = false
  }
}
</script>

<template>
  <div class="imports-page">
    <section class="imports-hero">
      <div class="hero-copy">
        <p class="eyebrow">Transferencia de datos</p>
        <h1>Importaciones y exportaciones administrativas</h1>
        <p>
          Selecciona una conexion real y trabaja con las tablas que el servidor devuelve
          en tiempo real para evitar nombres invalidos.
        </p>
      </div>

      <div class="hero-selector">
        <label>
          <span>Base de datos / conexion</span>
          <select v-model="selectedDatabaseId">
            <option v-for="database in databaseTargets" :key="database.id" :value="database.id">
              {{ database.engine }} · {{ database.database }}
            </option>
          </select>
        </label>

        <article class="source-card">
          <strong>{{ selectedDatabase.label }}</strong>
          <p>{{ selectedDatabase.detail }}</p>
          <div class="database-meta">
            <span class="meta-pill">{{ selectedDatabase.engine }}</span>
            <span class="meta-pill">{{ selectedDatabase.database }}</span>
            <span class="meta-pill">{{ isLoadingSchema ? 'Cargando...' : `${availableTables.length} tablas` }}</span>
            <span class="meta-pill" :class="selectedDatabase.status === 'Activa' ? 'meta-pill-active' : ''">
              {{ selectedDatabase.status }}
            </span>
          </div>
          <small>{{ selectedDatabase.host }}</small>
          <small v-if="schemaError">{{ schemaError }}</small>
        </article>
      </div>
    </section>

    <section class="operations-grid">
      <article class="operation-card">
        <div class="card-heading">
          <span class="badge">Importar</span>
          <h2>Cargar Excel a la BD</h2>
          <p>Sube archivos `.xlsx`, `.xls` o `.csv` y apunta a una tabla real obtenida desde el API.</p>
        </div>

        <div v-if="importError" class="error-panel">
          <strong>{{ importError.title }}</strong>
          <p>{{ importError.message }}</p>
          <p v-if="importError.missingColumns.length">
            Columnas faltantes: {{ importError.missingColumns.join(', ') }}
          </p>
          <details v-if="importError.detail" class="error-details">
            <summary>Ver detalle tecnico</summary>
            <pre>{{ importError.detail }}</pre>
          </details>
        </div>

        <label class="field">
          <span>Tabla real a importar</span>
          <select v-model="selectedSourceId" :disabled="isLoadingSchema || !availableTables.length">
            <option v-for="table in availableTables" :key="table.id" :value="table.id">
              {{ table.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Modo de importacion</span>
          <select v-model="importMode">
            <option value="append">Agregar registros</option>
            <option value="replace">Reemplazar registros</option>
          </select>
        </label>

        <label class="upload-box">
          <input accept=".xlsx,.xls,.csv" type="file" @change="handleFileSelection" />
          <span>{{ selectedFile ? selectedFile.name : 'Seleccionar archivo Excel o CSV' }}</span>
          <small>El backend ya acepta `csv`, `xlsx` y `xls` para esta importacion.</small>
        </label>

        <div v-if="selectedSource" class="table-summary">
          <strong>{{ selectedSource.label }}</strong>
          <p>{{ selectedSource.description }}</p>
        </div>

        <div class="columns-preview">
          <span>Columnas esperadas</span>
          <div class="pill-row">
            <span v-for="column in selectedSource?.columns || []" :key="column" class="pill">{{ column }}</span>
          </div>
        </div>

        <div class="card-actions">
          <button type="button" class="ghost-btn" @click="downloadTemplate">Descargar plantilla</button>
          <button type="button" class="primary-btn" :disabled="isImporting || isLoadingSchema || !selectedSource" @click="submitImport">
            {{ isImporting ? 'Importando...' : 'Importar archivo' }}
          </button>
        </div>
      </article>

      <article class="operation-card">
        <div class="card-heading">
          <span class="badge soft">Exportar</span>
          <h2>Extraer informacion</h2>
          <p>Genera archivos desde una tabla real de la base seleccionada para respaldo o auditoria.</p>
        </div>

        <label class="field">
          <span>Tabla real a exportar</span>
          <select v-model="selectedSourceId" :disabled="isLoadingSchema || !availableTables.length">
            <option v-for="table in availableTables" :key="`export-${table.id}`" :value="table.id">
              {{ table.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Formato de salida</span>
          <select v-model="exportFormat">
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </label>

        <div v-if="selectedSource" class="export-summary">
          <strong>{{ selectedSource.name }}</strong>
          <p>{{ selectedSource.description }}</p>
          <div class="pill-row">
            <span v-for="column in selectedSource.columns" :key="`export-${column}`" class="pill muted-pill">
              {{ column }}
            </span>
          </div>
        </div>

        <div class="card-actions export-actions">
          <button type="button" class="primary-btn" :disabled="isExporting || isLoadingSchema || !selectedSource" @click="exportData">
            {{ isExporting ? 'Exportando...' : 'Exportar informacion' }}
          </button>
        </div>
      </article>
    </section>

    <section class="jobs-section">
      <div class="section-heading">
        <h2>Tablas detectadas</h2>
        <p>Vista rapida de las tablas reales encontradas para la conexion seleccionada.</p>
      </div>

      <div class="jobs-list">
        <article v-if="isLoadingSchema" class="job-card job-card-empty">
          <div>
            <span class="job-type">Cargando</span>
            <strong>Consultando tablas reales</strong>
          </div>
          <span class="job-status ok">En proceso</span>
          <p>Estamos leyendo el esquema desde el backend para evitar nombres de tabla invalidos.</p>
        </article>

        <article v-else-if="!availableTables.length" class="job-card job-card-empty">
          <div>
            <span class="job-type">Sin tablas</span>
            <strong>No se encontraron tablas disponibles</strong>
          </div>
          <span class="job-status error">Sin datos</span>
          <p>{{ schemaError || 'La conexion seleccionada no devolvio tablas para esta cuenta.' }}</p>
        </article>

        <article v-for="table in availableTables" :key="table.id" class="job-card">
          <div>
            <span class="job-type">Tabla real</span>
            <strong>{{ table.name }}</strong>
          </div>
          <span class="job-status ok">{{ table.columns.length }} columnas base</span>
          <p>{{ table.description }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.imports-page {
  min-height: 100vh;
  padding: 1.5rem clamp(1.25rem, 5vw, 4rem) 2.5rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
  color: #111111;
}

.imports-hero,
.operations-grid,
.jobs-section,
.hero-selector,
.source-card,
.operation-card,
.card-heading,
.columns-preview,
.export-summary,
.section-heading,
.jobs-list,
.job-card,
.table-summary {
  display: grid;
  gap: 1rem;
}

.imports-hero {
  grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.9fr);
  align-items: start;
  padding-bottom: 1.5rem;
}

.eyebrow,
.badge,
.job-type,
.pill {
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.eyebrow {
  margin: 0;
  color: #8c6a1f;
}

.hero-copy h1,
.card-heading h2,
.section-heading h2 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.hero-copy h1 {
  font-size: clamp(2.5rem, 6vw, 4rem);
  line-height: 0.98;
}

.hero-copy p,
.card-heading p,
.source-card p,
.export-summary p,
.table-summary p,
.section-heading p,
.job-card p,
.upload-box small,
.source-card small {
  margin: 0;
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-selector {
  padding: 1.15rem;
  border: 1px solid #ece5d6;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
}

.field,
.hero-selector label {
  display: grid;
  gap: 0.55rem;
}

.field span,
.hero-selector span,
.columns-preview span {
  font-size: 0.88rem;
  font-weight: 700;
}

select,
.upload-box {
  min-height: 3rem;
  border: 1px solid #e7dfcf;
  border-radius: 16px;
  background: #ffffff;
}

select {
  padding: 0 0.9rem;
}

.source-card,
.operation-card,
.job-card {
  padding: 1.2rem;
  border: 1px solid #ece5d6;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.error-panel {
  display: grid;
  gap: 0.6rem;
  padding: 1rem;
  border: 1px solid rgba(139, 47, 47, 0.18);
  border-radius: 18px;
  color: #7f1d1d;
  background: #fff1f1;
}

.error-panel strong {
  font-size: 1rem;
}

.error-panel p {
  margin: 0;
  color: #7f1d1d;
  line-height: 1.6;
}

.error-panel pre {
  margin: 0;
  padding: 0.8rem;
  overflow-x: auto;
  border-radius: 12px;
  color: #631d1d;
  background: rgba(127, 29, 29, 0.08);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.85rem;
}

.error-details {
  display: grid;
  gap: 0.5rem;
}

.error-details summary {
  cursor: pointer;
  font-weight: 700;
  color: #7f1d1d;
}

.source-card strong,
.export-summary strong,
.table-summary strong,
.job-card strong {
  font-size: 1.05rem;
}

.database-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
  color: #516987;
  background: #edf2f7;
}

.meta-pill-active {
  color: #0f6b46;
  background: #daf2e6;
}

.operations-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 1rem 0 2rem;
}

.badge {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f4ead1;
}

.soft {
  color: #3f5d78;
  background: #e7eff7;
}

.upload-box {
  align-items: center;
  padding: 0.9rem 1rem;
  cursor: pointer;
}

.upload-box input {
  display: none;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f4ead1;
}

.muted-pill {
  color: #516987;
  background: #edf2f7;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: auto;
}

.primary-btn,
.ghost-btn {
  min-height: 3rem;
  padding: 0 1rem;
  border-radius: 16px;
  font-weight: 800;
}

.primary-btn {
  border: 1px solid #d3b571;
  color: #111111;
  background: linear-gradient(135deg, #f3ddb0, #d8b45b);
}

.ghost-btn {
  border: 1px solid #ddd4c3;
  color: #111111;
  background: #ffffff;
}

.primary-btn:disabled,
.ghost-btn:disabled,
select:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.jobs-section {
  gap: 1.15rem;
}

.jobs-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.job-card {
  align-content: start;
}

.job-card-empty {
  grid-column: 1 / -1;
}

.job-type {
  color: #8c6a1f;
}

.job-status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 800;
}

.job-status.ok {
  color: #0f6b46;
  background: #daf2e6;
}

.job-status.error {
  color: #8b2f2f;
  background: #f6dddd;
}

@media (max-width: 1080px) {
  .imports-hero,
  .operations-grid,
  .jobs-list {
    grid-template-columns: 1fr;
  }
}
</style>

