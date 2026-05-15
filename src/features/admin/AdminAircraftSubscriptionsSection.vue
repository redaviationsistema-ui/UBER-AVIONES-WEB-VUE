<script setup>
import { computed, ref, watch } from 'vue'
import { requestWithCandidates } from '../../lib/backendCrud'
import { resolveMediaUrl } from '../../lib/api'

const props = defineProps({
  aircraft: { type: Array, required: true },
  subscriptions: { type: Array, required: true },
  mode: { type: String, default: 'aircraft' },
})

defineEmits(['approve-aircraft', 'reject-aircraft', 'suspend-aircraft'])

const companyFilter = ref('Todas')
const approvalFilter = ref('Todas')
const matchingFilter = ref('Todos')
const documentsFilter = ref('Todos')
const trialFilter = ref('Todos')
const searchTerm = ref('')
const sortMode = ref('recent')
const selectedAircraft = ref(null)
const downloadingDocumentId = ref('')
const documentDownloadError = ref('')
const previewDocument = ref(null)

const approvalOptions = ['Todas', 'Aprobadas', 'Pendientes', 'Suspendidas']
const matchingOptions = ['Todos', 'Visibles', 'Bloqueados']
const documentOptions = ['Todos', 'Validos', 'Incompletos', 'Vencidos']
const trialOptions = ['Todos', 'Trial activo', 'Trial vencido', 'Sin trial']
const sortOptions = [
  { label: 'Mas recientes', value: 'recent' },
  { label: 'Trial proximo', value: 'trial' },
  { label: 'Nombre A-Z', value: 'az' },
  { label: 'Aprobadas primero', value: 'approved' },
]

function providerName(item) {
  return item.provider?.commercial_name || item.provider?.company_name || item.provider_name || 'Proveedor sin ligar'
}

function aircraftName(item) {
  return item.model || item.name || item.registration || 'Aeronave'
}

function baseLabel(item) {
  return item.base_airport || item.base || item.airport || item.location || 'Base pendiente'
}

function normalizeMediaUrl(url = '') {
  return resolveMediaUrl(url)
}

function getPrimaryImageValue(raw = {}) {
  if (typeof raw === 'string') return raw
  return (
    raw.main_image ||
    raw.mainImage ||
    raw.image_url ||
    raw.imageUrl ||
    raw.image ||
    raw.image_path ||
    raw.imagePath ||
    raw.photo ||
    raw.photo_url ||
    raw.photoUrl ||
    raw.cover_image ||
    raw.coverImage ||
    raw.cover_photo ||
    raw.coverPhoto ||
    raw.thumbnail ||
    raw.thumbnail_url ||
    raw.thumbnailUrl ||
    raw.exterior_image ||
    raw.exteriorImage ||
    raw.interior_image ||
    raw.interiorImage ||
    ''
  )
}

function normalizeImageCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  if (typeof value === 'object') return [value]
  return []
}

function aircraftImages(item = {}) {
  const images = [
    ...normalizeImageCollection(item.images),
    ...normalizeImageCollection(item.aircraft_images),
    ...normalizeImageCollection(item.aircraftImages),
    ...normalizeImageCollection(item.gallery_images),
    ...normalizeImageCollection(item.galleryImages),
    ...normalizeImageCollection(item.gallery),
    ...normalizeImageCollection(item.photos),
    ...normalizeImageCollection(item.media),
    ...normalizeImageCollection(item.multimedia),
    ...normalizeImageCollection(item.pictures),
    ...normalizeImageCollection(item.files),
  ]

  const normalizedImages = images
    .map((image, index) => {
      const imageRecord = typeof image === 'string' ? { url: image } : image || {}
      const imageUrl = normalizeMediaUrl(
        getPrimaryImageValue(imageRecord) ||
          imageRecord.url ||
          imageRecord.path ||
          imageRecord.file_url ||
          imageRecord.fileUrl ||
          imageRecord.public_url ||
          imageRecord.publicUrl ||
          imageRecord.src ||
          '',
      )
      if (!imageUrl) return null

      return {
        id: imageRecord.id || `image-${index}`,
        title: imageRecord.title || imageRecord.name || imageRecord.kind || `Imagen ${index + 1}`,
        kind: String(imageRecord.kind || imageRecord.slot || (index === 0 ? 'main' : 'gallery')).toLowerCase(),
        imageUrl,
      }
    })
    .filter(Boolean)

  const mainImage = normalizeMediaUrl(getPrimaryImageValue(item))
  if (mainImage && !normalizedImages.some((image) => image.imageUrl === mainImage)) {
    normalizedImages.unshift({
      id: 'main-image',
      title: 'Imagen principal',
      kind: 'main',
      imageUrl: mainImage,
    })
  }

  return normalizedImages
}

function primaryAircraftImage(item = {}) {
  const images = aircraftImages(item)
  return images.find((image) => image.kind === 'main')?.imageUrl || images[0]?.imageUrl || ''
}

function formatNumber(value, suffix = '') {
  const number = Number(value || 0)
  if (!number) return 'Pendiente'
  return `${new Intl.NumberFormat('es-MX').format(number)}${suffix}`
}

function formatMoney(value) {
  const number = Number(value || 0)
  if (!number) return 'Pendiente'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(number)
}

function formatList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ') || 'Por completar'
  return value || 'Por completar'
}

function normalizeDocumentCollection(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value)
  return []
}

function aircraftDocuments(item = {}) {
  const documents = [
    ...normalizeDocumentCollection(item.documents),
    ...normalizeDocumentCollection(item.aircraft_documents),
    ...normalizeDocumentCollection(item.aircraftDocuments),
    ...normalizeDocumentCollection(item.documentos),
    ...normalizeDocumentCollection(item.files),
    ...normalizeDocumentCollection(item.attachments),
  ]

  return documents
    .map((document, index) => {
      const record = typeof document === 'string' ? { document_name: document } : document || {}
      const fileUrl = normalizeMediaUrl(
        record.file_url ||
          record.fileUrl ||
          record.document_url ||
          record.documentUrl ||
          record.url ||
          record.path ||
          record.file_path ||
          record.filePath ||
          '',
      )

      return {
        id: record.id || record.uuid || `document-${index}`,
        aircraftId: record.aircraft_id || record.aircraftId || item.id || '',
        type: record.document_type || record.type || record.kind || 'documento',
        name:
          record.document_name ||
          record.name ||
          record.file_name ||
          record.fileName ||
          record.title ||
          `Documento ${index + 1}`,
        status: record.status || record.state || record.validation_status || 'Pendiente',
        expiresAt: record.expires_at || record.expiration_date || record.expirationDate || null,
        notes: record.notes || record.observations || record.observaciones || '',
        fileUrl,
      }
    })
    .filter((document) => document.name || document.fileUrl)
}

function documentTone(document = {}) {
  const status = normalizeStatus(document.status)
  if (status.includes('valid') || status.includes('approved') || status.includes('vigente')) return 'success'
  if (status.includes('reject') || status.includes('venc') || status.includes('expired')) return 'danger'
  return 'warning'
}

function documentTypeLabel(type = '') {
  const normalized = normalizeStatus(type)
  const labels = {
    insurance: 'Seguro',
    airworthiness: 'Aeronavegabilidad',
    maintenance: 'Mantenimiento',
    maintenance_sticker: 'Sticker mantenimiento',
    flight_logbook: 'Bitacora de vuelo',
    certificate: 'Certificado',
    registration: 'Registro',
    documento: 'Documento',
  }
  return labels[normalized] || type || 'Documento'
}

function isPrivateStorageUrl(url = '') {
  return /amazonaws\.com|s3[.-]|red-aviation-images/i.test(String(url || ''))
}

function cleanDownloadError(error) {
  const status = Number(error?.status || 0)
  if (status === 404 || /Rutas probadas|could not be found|route .* could not be found/i.test(error?.message || '')) {
    return 'El backend todavia no tiene registrada la ruta para abrir documentos privados. Agrega la ruta de descarga autenticada en Laravel y vuelve a intentar.'
  }

  if (status === 403) {
    return 'No tienes permisos para abrir este documento con la sesion actual.'
  }

  return (
    error?.message ||
    'El archivo esta privado en S3. Necesitas una ruta backend que entregue el documento autenticado o una URL firmada.'
  )
}

function showDocumentPreview(url, documentRecord) {
  if (previewDocument.value?.objectUrl) {
    URL.revokeObjectURL(previewDocument.value.objectUrl)
  }

  previewDocument.value = {
    url,
    objectUrl: url.startsWith('blob:') ? url : '',
    name: documentRecord.name || 'Documento',
    type: documentRecord.type || 'documento',
  }
}

function closeDocumentPreview() {
  if (previewDocument.value?.objectUrl) {
    URL.revokeObjectURL(previewDocument.value.objectUrl)
  }

  previewDocument.value = null
}

function previewBlob(blob, documentRecord) {
  const url = URL.createObjectURL(blob)
  showDocumentPreview(url, documentRecord)
}

async function openAircraftDocument(documentRecord) {
  documentDownloadError.value = ''
  downloadingDocumentId.value = documentRecord.id

  try {
    if (!isPrivateStorageUrl(documentRecord.fileUrl) && documentRecord.fileUrl) {
      showDocumentPreview(documentRecord.fileUrl, documentRecord)
      return
    }

    const aircraftId = documentRecord.aircraftId || selectedAircraft.value?.id
    const response = await requestWithCandidates([
      { method: 'download', path: `/admin/aircraft-documents/${documentRecord.id}/download` },
      { method: 'download', path: `/admin/aeronaves/documentos/${documentRecord.id}/descargar` },
      { method: 'download', path: `/operator/aircraft/${aircraftId}/documents/${documentRecord.id}/download` },
      { method: 'download', path: `/provider/aircraft/${aircraftId}/documents/${documentRecord.id}/download` },
      { method: 'download', path: `/proveedor/aeronaves/${aircraftId}/documentos/${documentRecord.id}/descargar` },
    ])

    previewBlob(response.blob, documentRecord)
  } catch (error) {
    documentDownloadError.value = cleanDownloadError(error)
  } finally {
    downloadingDocumentId.value = ''
  }
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase()
}

function isApproved(item) {
  return Boolean(item.approved || normalizeStatus(item.status) === 'active')
}

function isSuspended(item) {
  const status = normalizeStatus(item.status)
  return status.includes('suspend') || status.includes('block') || status.includes('reject') || status === 'inactive'
}

function hasValidDocuments(item) {
  return Boolean(item.documents_valid)
}

function documentsState(item) {
  const status = normalizeStatus(item.documents_status || item.document_status)
  if (status.includes('venc') || status.includes('expir')) return 'Vencidos'
  return hasValidDocuments(item) ? 'Validos' : 'Incompletos'
}

function trialState(item) {
  const status = normalizeStatus(item.status)
  if (!item.trial_ends_at && !status.includes('trial')) return 'Sin trial'
  if (status.includes('trial') && !status.includes('expired')) return 'Trial activo'
  if (!item.trial_ends_at) return 'Trial activo'

  const trialDate = new Date(item.trial_ends_at)
  if (Number.isNaN(trialDate.getTime())) return 'Trial activo'
  return trialDate >= new Date() ? 'Trial activo' : 'Trial vencido'
}

function matchingVisible(item) {
  return isApproved(item) && hasValidDocuments(item) && ['trial_active', 'active'].includes(normalizeStatus(item.status))
}

function approvalState(item) {
  if (isSuspended(item)) return 'Suspendidas'
  return isApproved(item) ? 'Aprobadas' : 'Pendientes'
}

function statusChip(item) {
  const state = approvalState(item)
  if (state === 'Aprobadas') return { label: 'Aprobada', tone: 'success', icon: '✓' }
  if (state === 'Suspendidas') return { label: 'Suspendida', tone: 'danger', icon: '!' }
  return { label: 'Pendiente', tone: 'warning', icon: '!' }
}

function docsChip(item) {
  const state = documentsState(item)
  if (state === 'Validos') return { label: 'Docs validos', tone: 'success', icon: '✓' }
  if (state === 'Vencidos') return { label: 'Docs vencidos', tone: 'danger', icon: '!' }
  return { label: 'Docs incompletos', tone: 'warning', icon: '!' }
}

function matchingChip(item) {
  return matchingVisible(item)
    ? { label: 'Matching visible', tone: 'info', icon: '•' }
    : { label: 'Matching bloqueado', tone: 'neutral', icon: '•' }
}

function trialChip(item) {
  const state = trialState(item)
  if (state === 'Trial activo') return { label: 'Trial activo', tone: 'info', icon: '•' }
  if (state === 'Trial vencido') return { label: 'Trial vencido', tone: 'danger', icon: '!' }
  return { label: 'Sin trial', tone: 'neutral', icon: '•' }
}

function companyInitials(name) {
  return String(name || 'NA')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function formatDate(value) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function matchesText(item) {
  const query = searchTerm.value.trim().toLowerCase()
  if (!query) return true
  return [aircraftName(item), item.registration, providerName(item), baseLabel(item), item.type, item.category]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query))
}

const companyOptions = computed(() => {
  const names = [...new Set(props.aircraft.map(providerName))]
  return ['Todas', ...names.sort((a, b) => a.localeCompare(b))]
})

const companyCounts = computed(() =>
  props.aircraft.reduce(
    (counts, item) => {
      const name = providerName(item)
      counts[name] = (counts[name] || 0) + 1
      counts.Todas += 1
      return counts
    },
    { Todas: 0 },
  ),
)

const activeFilters = computed(() =>
  [
    companyFilter.value !== 'Todas' ? `Empresa: ${companyFilter.value}` : '',
    approvalFilter.value !== 'Todas' ? approvalFilter.value : '',
    matchingFilter.value !== 'Todos' ? `Matching ${matchingFilter.value.toLowerCase()}` : '',
    documentsFilter.value !== 'Todos' ? `Docs ${documentsFilter.value.toLowerCase()}` : '',
    trialFilter.value !== 'Todos' ? trialFilter.value : '',
  ].filter(Boolean),
)

const companyFilteredAircraft = computed(() =>
  props.aircraft.filter((item) => companyFilter.value === 'Todas' || providerName(item) === companyFilter.value),
)

const filteredAircraft = computed(() => {
  const items = companyFilteredAircraft.value.filter((item) => {
    const approvalMatches = approvalFilter.value === 'Todas' || approvalState(item) === approvalFilter.value
    const matchingMatches =
      matchingFilter.value === 'Todos' ||
      (matchingFilter.value === 'Visibles' && matchingVisible(item)) ||
      (matchingFilter.value === 'Bloqueados' && !matchingVisible(item))
    const documentMatches = documentsFilter.value === 'Todos' || documentsState(item) === documentsFilter.value
    const trialMatches = trialFilter.value === 'Todos' || trialState(item) === trialFilter.value
    return approvalMatches && matchingMatches && documentMatches && trialMatches && matchesText(item)
  })

  return [...items].sort((a, b) => {
    if (sortMode.value === 'az') return aircraftName(a).localeCompare(aircraftName(b))
    if (sortMode.value === 'approved') return Number(isApproved(b)) - Number(isApproved(a))
    if (sortMode.value === 'trial') {
      const aTime = a.trial_ends_at ? new Date(a.trial_ends_at).getTime() : Number.MAX_SAFE_INTEGER
      const bTime = b.trial_ends_at ? new Date(b.trial_ends_at).getTime() : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    }
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  })
})

const kpis = computed(() => [
  { label: 'Aeronaves totales', value: companyFilteredAircraft.value.length, tone: 'default' },
  { label: 'Aprobadas', value: companyFilteredAircraft.value.filter(isApproved).length, tone: 'success' },
  { label: 'Pendientes', value: companyFilteredAircraft.value.filter((item) => approvalState(item) === 'Pendientes').length, tone: 'warning' },
  { label: 'Suspendidas', value: companyFilteredAircraft.value.filter(isSuspended).length, tone: 'danger' },
  { label: 'Matching visible', value: companyFilteredAircraft.value.filter(matchingVisible).length, tone: 'info' },
])

const companyGroups = computed(() => {
  const groups = new Map()
  filteredAircraft.value.forEach((item) => {
    const name = providerName(item)
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(item)
  })
  return [...groups.entries()].map(([name, items]) => ({
    name,
    items,
    approved: items.filter(isApproved).length,
    pending: items.filter((item) => approvalState(item) === 'Pendientes').length,
    visible: items.filter(matchingVisible).length,
  }))
})

function clearFilters() {
  companyFilter.value = 'Todas'
  approvalFilter.value = 'Todas'
  matchingFilter.value = 'Todos'
  documentsFilter.value = 'Todos'
  trialFilter.value = 'Todos'
  searchTerm.value = ''
  sortMode.value = 'recent'
}

function selectAircraft(item) {
  selectedAircraft.value = item
}

function closeDrawer() {
  selectedAircraft.value = null
}

watch(
  () => props.aircraft,
  () => {
    if (selectedAircraft.value && !props.aircraft.some((item) => item.id === selectedAircraft.value.id)) {
      selectedAircraft.value = null
    }
  },
)
</script>

<template>
  <section v-if="mode === 'subscriptions'" class="aircraft-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">Suscripciones por avion</span>
        <h3>Cobro y vigencias por aeronave</h3>
        <p class="muted">Cada avion vive con su propia suscripcion y referencia de pago.</p>
      </div>
    </div>

    <div class="subscription-grid">
      <article v-for="item in subscriptions" :key="item.id" class="surface subscription-card">
        <span class="badge">{{ item.plan?.name || 'Plan' }}</span>
        <h4>{{ item.aircraft?.registration || 'Aeronave' }} · {{ item.aircraft?.model || 'N/D' }}</h4>
        <p class="muted">{{
          item.aircraft?.provider?.commercial_name ||
            item.aircraft?.provider?.company_name ||
            item.provider?.commercial_name ||
            item.provider?.company_name
        }}</p>
        <div class="meta-grid">
          <div>
            <span>Estado</span>
            <strong>{{ item.status }}</strong>
          </div>
          <div>
            <span>Periodo</span>
            <strong>{{ item.starts_at?.slice(0, 10) }} a {{ item.ends_at?.slice(0, 10) }}</strong>
          </div>
          <div>
            <span>Pago</span>
            <strong>{{ item.payment_provider }}</strong>
          </div>
          <div>
            <span>Referencia</span>
            <strong>{{ item.payment_reference }}</strong>
          </div>
        </div>
      </article>
    </div>
  </section>

  <section v-else class="aircraft-admin-shell">
    <div class="aircraft-command">
      <header class="command-hero">
        <div>
          <span class="eyebrow">Dashboard aeronaves</span>
          <h2>Control center de flota</h2>
          <p>Revision ejecutiva de aprobacion, documentos, trial y visibilidad en marketplace.</p>
        </div>
        <button type="button" class="export-button">Exportar</button>
      </header>

      <div class="kpi-grid" aria-label="Resumen de aeronaves">
        <article v-for="item in kpis" :key="item.label" :class="['kpi-card', `tone-${item.tone}`]">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </article>
      </div>

      <section class="filter-panel">
        <div class="search-row">
          <label>
            <span>Buscar</span>
            <input v-model="searchTerm" type="search" placeholder="Gulfstream, Hawker, Cessna..." />
          </label>
          <div class="sort-control">
            <span>Ordenar por</span>
            <div>
              <button
                v-for="item in sortOptions"
                :key="item.value"
                type="button"
                :class="{ active: sortMode === item.value }"
                @click="sortMode = item.value"
              >
                {{ item.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="company-strip" aria-label="Filtro por empresa">
          <button
            v-for="company in companyOptions"
            :key="company"
            type="button"
            :class="{ active: companyFilter === company }"
            @click="companyFilter = company"
          >
            <span>{{ companyInitials(company) }}</span>
            {{ company }} <small>{{ companyCounts[company] || 0 }}</small>
          </button>
        </div>

        <div class="filter-groups">
          <div>
            <span>Aprobacion</span>
            <button
              v-for="option in approvalOptions"
              :key="option"
              type="button"
              :class="{ active: approvalFilter === option }"
              @click="approvalFilter = option"
            >
              {{ option }}
            </button>
          </div>
          <div>
            <span>Matching</span>
            <button
              v-for="option in matchingOptions"
              :key="option"
              type="button"
              :class="{ active: matchingFilter === option }"
              @click="matchingFilter = option"
            >
              {{ option }}
            </button>
          </div>
          <div>
            <span>Documentos</span>
            <button
              v-for="option in documentOptions"
              :key="option"
              type="button"
              :class="{ active: documentsFilter === option }"
              @click="documentsFilter = option"
            >
              {{ option }}
            </button>
          </div>
          <div>
            <span>Trial</span>
            <button
              v-for="option in trialOptions"
              :key="option"
              type="button"
              :class="{ active: trialFilter === option }"
              @click="trialFilter = option"
            >
              {{ option }}
            </button>
          </div>
        </div>

        <div v-if="activeFilters.length" class="active-filter-row">
          <span v-for="filter in activeFilters" :key="filter">{{ filter }}</span>
          <button type="button" @click="clearFilters">Limpiar filtros</button>
        </div>
      </section>

      <div v-if="!filteredAircraft.length" class="empty-state">
        <strong>No hay aeronaves con estos filtros.</strong>
        <button type="button" @click="clearFilters">Mostrar todo</button>
      </div>

      <section v-for="group in companyGroups" :key="group.name" class="company-group">
        <div class="company-head">
          <div class="company-avatar">{{ companyInitials(group.name) }}</div>
          <div>
            <h3>{{ group.name }}</h3>
            <p>{{ group.items.length }} aeronaves · {{ group.approved }} activas · {{ group.pending }} pendientes · {{ group.visible }} visibles</p>
          </div>
        </div>

        <div class="aircraft-grid">
          <article
            v-for="item in group.items"
            :key="item.id"
            class="aircraft-card"
            @click="selectAircraft(item)"
          >
            <div :class="['aircraft-photo', { 'aircraft-photo-empty': !primaryAircraftImage(item) }]">
              <img
                v-if="primaryAircraftImage(item)"
                :src="primaryAircraftImage(item)"
                :alt="`Imagen de ${aircraftName(item)}`"
                loading="lazy"
              />
              <span v-else>Imagen pendiente</span>
            </div>

            <div class="aircraft-topline">
              <span class="aircraft-icon">✈</span>
              <span :class="['chip', `chip-${statusChip(item).tone}`]">
                {{ statusChip(item).icon }} {{ statusChip(item).label }}
              </span>
            </div>

            <div class="aircraft-title">
              <span>{{ item.registration || 'Sin matricula' }}</span>
              <h4>{{ aircraftName(item) }}</h4>
              <p>{{ baseLabel(item) }} · {{ providerName(item) }}</p>
            </div>

            <div class="aircraft-specs">
              <span>{{ item.manufacturer || 'Fabricante pendiente' }}</span>
              <span>{{ formatNumber(item.capacity || item.passenger_capacity, ' pax') }}</span>
              <span>{{ formatNumber(item.range_km || item.rangeKm, ' km') }}</span>
            </div>

            <div class="status-list">
              <span :class="['chip', `chip-${docsChip(item).tone}`]">
                {{ docsChip(item).icon }} {{ docsChip(item).label }}
              </span>
              <span :class="['chip', `chip-${matchingChip(item).tone}`]">
                {{ matchingChip(item).icon }} {{ matchingChip(item).label }}
              </span>
              <span :class="['chip', `chip-${trialChip(item).tone}`]">
                {{ trialChip(item).icon }} {{ trialChip(item).label }}
              </span>
            </div>

            <div class="card-foot">
              <small>Trial vence: {{ formatDate(item.trial_ends_at) }}</small>
              <button type="button" @click.stop="selectAircraft(item)">Ver</button>
            </div>

            <div class="actions-row">
              <button class="action-approve" type="button" @click.stop="$emit('approve-aircraft', item.id)">
                ✓ Aprobar
              </button>
              <button class="action-reject" type="button" @click.stop="$emit('reject-aircraft', item.id)">
                × Rechazar
              </button>
              <button class="action-suspend" type="button" @click.stop="$emit('suspend-aircraft', item.id)">
                ! Suspender
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <Transition name="drawer-fade">
      <div v-if="selectedAircraft" class="drawer-scrim" @click="closeDrawer"></div>
    </Transition>
    <Transition name="drawer-slide">
      <aside v-if="selectedAircraft" class="detail-drawer" aria-label="Detalle de aeronave">
        <div :class="['drawer-media', { 'drawer-media-empty': !primaryAircraftImage(selectedAircraft) }]">
          <img
            v-if="primaryAircraftImage(selectedAircraft)"
            :src="primaryAircraftImage(selectedAircraft)"
            :alt="`Imagen de ${aircraftName(selectedAircraft)}`"
          />
          <span v-else>✈</span>
        </div>
        <div class="drawer-head">
          <div>
            <span class="mini-label">{{ selectedAircraft.registration || 'Sin matricula' }}</span>
            <h3>{{ aircraftName(selectedAircraft) }}</h3>
            <p>{{ providerName(selectedAircraft) }} · {{ baseLabel(selectedAircraft) }}</p>
          </div>
          <button type="button" @click="closeDrawer">Cerrar</button>
        </div>

        <div class="drawer-chips">
          <span :class="['chip', `chip-${statusChip(selectedAircraft).tone}`]">{{ statusChip(selectedAircraft).label }}</span>
          <span :class="['chip', `chip-${docsChip(selectedAircraft).tone}`]">{{ docsChip(selectedAircraft).label }}</span>
          <span :class="['chip', `chip-${matchingChip(selectedAircraft).tone}`]">{{ matchingChip(selectedAircraft).label }}</span>
        </div>

        <div v-if="aircraftImages(selectedAircraft).length > 1" class="drawer-gallery">
          <img
            v-for="image in aircraftImages(selectedAircraft).slice(0, 6)"
            :key="image.id"
            :src="image.imageUrl"
            :alt="image.title"
            loading="lazy"
          />
        </div>

        <div class="drawer-section">
          <h4>Operational status</h4>
          <dl>
            <div>
              <dt>Estado backend</dt>
              <dd>{{ selectedAircraft.status || 'Pendiente' }}</dd>
            </div>
            <div>
              <dt>Trial vence</dt>
              <dd>{{ formatDate(selectedAircraft.trial_ends_at) }}</dd>
            </div>
            <div>
              <dt>Actualizacion</dt>
              <dd>{{ formatDate(selectedAircraft.updated_at || selectedAircraft.created_at) }}</dd>
            </div>
          </dl>
        </div>

        <div class="drawer-section">
          <h4>Documentos y certificados</h4>
          <dl>
            <div>
              <dt>Documentos</dt>
              <dd>{{ aircraftDocuments(selectedAircraft).length }} archivo(s) · {{ documentsState(selectedAircraft) }}</dd>
            </div>
            <div>
              <dt>Marketplace</dt>
              <dd>{{ matchingVisible(selectedAircraft) ? 'Visible para clientes' : 'Oculto hasta completar validacion' }}</dd>
            </div>
          </dl>

          <div v-if="aircraftDocuments(selectedAircraft).length" class="document-list">
            <article
              v-for="document in aircraftDocuments(selectedAircraft)"
              :key="document.id"
              class="document-item"
            >
              <div>
                <span :class="['chip', `chip-${documentTone(document)}`]">{{ document.status }}</span>
                <strong>{{ document.name }}</strong>
                <small>{{ documentTypeLabel(document.type) }} · Vence: {{ formatDate(document.expiresAt) }}</small>
                <p v-if="document.notes">{{ document.notes }}</p>
              </div>
              <button
                v-if="document.fileUrl || document.id"
                type="button"
                class="document-open"
                :disabled="downloadingDocumentId === document.id"
                @click="openAircraftDocument(document)"
              >
                {{ downloadingDocumentId === document.id ? 'Abriendo...' : 'Abrir' }}
              </button>
              <span v-else class="document-missing">Sin archivo</span>
            </article>
          </div>
          <p v-if="documentDownloadError" class="document-error">{{ documentDownloadError }}</p>
          <p v-if="!aircraftDocuments(selectedAircraft).length" class="documents-empty">
            No hay documentos cargados para esta aeronave.
          </p>
        </div>

        <div class="drawer-section">
          <h4>Pricing y disponibilidad</h4>
          <dl>
            <div>
              <dt>Fabricante</dt>
              <dd>{{ selectedAircraft.manufacturer || 'Pendiente' }}</dd>
            </div>
            <div>
              <dt>Año</dt>
              <dd>{{ selectedAircraft.model_year || selectedAircraft.year || 'Pendiente' }}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{{ selectedAircraft.type || selectedAircraft.category || 'Jet ejecutivo' }}</dd>
            </div>
            <div>
              <dt>Capacidad</dt>
              <dd>{{ formatNumber(selectedAircraft.capacity || selectedAircraft.passenger_capacity, ' pasajeros') }}</dd>
            </div>
            <div>
              <dt>Rango</dt>
              <dd>{{ formatNumber(selectedAircraft.range_km || selectedAircraft.rangeKm, ' km') }}</dd>
            </div>
            <div>
              <dt>Horas vuelo</dt>
              <dd>{{ selectedAircraft.flight_hours || selectedAircraft.hours || 'Pendiente' }}</dd>
            </div>
            <div>
              <dt>Tarifa hora</dt>
              <dd>{{ formatMoney(selectedAircraft.hourly_rate || selectedAircraft.hourlyPrice || selectedAircraft.price_per_hour) }}</dd>
            </div>
            <div>
              <dt>Minimo</dt>
              <dd>{{ formatNumber(selectedAircraft.minimum_hours || selectedAircraft.min_hours, ' h') }}</dd>
            </div>
            <div>
              <dt>Cobertura</dt>
              <dd>{{ formatList(selectedAircraft.coverage) }}</dd>
            </div>
            <div>
              <dt>Amenidades</dt>
              <dd>{{ formatList(selectedAircraft.amenities) }}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </Transition>

    <Transition name="drawer-fade">
      <div v-if="previewDocument" class="document-preview-scrim" @click="closeDocumentPreview"></div>
    </Transition>
    <Transition name="drawer-slide">
      <section v-if="previewDocument" class="document-preview" aria-label="Vista previa de documento">
        <header>
          <div>
            <span class="mini-label">{{ documentTypeLabel(previewDocument.type) }}</span>
            <h3>{{ previewDocument.name }}</h3>
          </div>
          <button type="button" @click="closeDocumentPreview">Cerrar</button>
        </header>
        <iframe :src="previewDocument.url" :title="previewDocument.name"></iframe>
      </section>
    </Transition>
  </section>
</template>

<style scoped>
.aircraft-page,
.subscription-grid,
.meta-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.subscription-card {
  padding: 1rem;
}

.subscription-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.subscription-card h4,
.page-head h3 {
  margin: 0;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.meta-grid div {
  display: grid;
  gap: 0.35rem;
}

.meta-grid span {
  color: #9ca3af;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.aircraft-admin-shell {
  display: grid;
  min-height: calc(100vh - 108px);
  color: #0f172a;
  background: #ffffff;
}

.aircraft-command,
.filter-panel,
.aircraft-card,
.empty-state {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
}

.company-avatar {
  display: grid;
  width: 2.45rem;
  height: 2.45rem;
  place-items: center;
  border-radius: 999px;
  color: #0f172a;
  background: #e0f2fe;
  font-size: 0.8rem;
  font-weight: 900;
}

.command-hero p,
.company-head p,
.aircraft-title p,
.card-foot small,
.drawer-head p,
.drawer-section dt {
  color: #64748b;
}

.aircraft-command {
  display: grid;
  gap: 1rem;
  border-radius: 8px;
  padding: 1rem;
  background: #ffffff;
}

.command-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.25rem 0.25rem 0;
}

.command-hero h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(1.6rem, 3vw, 2.35rem);
  letter-spacing: 0;
}

.command-hero p {
  margin: 0.45rem 0 0;
  max-width: 44rem;
}

.export-button,
.card-foot button,
.filter-panel button,
.drawer-head button,
.empty-state button,
.actions-row button {
  border: 0;
  border-radius: 8px;
  font-weight: 800;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.export-button {
  padding: 0.75rem 1rem;
  color: #0f172a;
  background: #f1f5f9;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
}

.kpi-card {
  min-height: 6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.9rem;
  background: #ffffff;
}

.kpi-card span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
}

.kpi-card strong {
  display: block;
  margin-top: 0.45rem;
  color: #0f172a;
  font-size: 2rem;
}

.tone-success {
  border-color: rgba(34, 197, 94, 0.3);
}

.tone-warning {
  border-color: rgba(245, 158, 11, 0.35);
}

.tone-danger {
  border-color: rgba(239, 68, 68, 0.35);
}

.tone-info {
  border-color: rgba(59, 130, 246, 0.35);
}

.filter-panel {
  display: grid;
  gap: 0.9rem;
  border-radius: 8px;
  padding: 1rem;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.55fr);
  gap: 0.75rem;
}

.search-row label,
.sort-control {
  display: grid;
  gap: 0.4rem;
}

.search-row span,
.filter-groups > div > span {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 900;
  text-transform: uppercase;
}

.search-row input {
  width: 100%;
  min-height: 2.8rem;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  color: #0f172a;
  background: #f8fafc;
  padding: 0 0.85rem;
  outline: none;
}

.sort-control > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.company-strip,
.active-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.company-strip button,
.sort-control button,
.filter-groups button,
.active-filter-row span,
.active-filter-row button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid #dbe3ef;
  color: #334155;
  background: #ffffff;
  padding: 0.5rem 0.68rem;
}

.company-strip button span {
  display: grid;
  width: 1.45rem;
  height: 1.45rem;
  place-items: center;
  border-radius: 999px;
  color: #075985;
  background: #e0f2fe;
  font-size: 0.62rem;
}

.company-strip small {
  color: #2563eb;
}

.company-strip button.active,
.sort-control button.active,
.filter-groups button.active {
  border-color: rgba(96, 165, 250, 0.65);
  color: #ffffff;
  background: #2563eb;
}

.filter-groups {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.filter-groups > div {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 0.45rem;
}

.filter-groups > div > span {
  width: 100%;
}

.active-filter-row span {
  color: #bfdbfe;
  background: rgba(59, 130, 246, 0.14);
}

.active-filter-row button {
  color: #ffffff;
  background: rgba(239, 68, 68, 0.18);
}

.company-group {
  display: grid;
  gap: 0.85rem;
}

.company-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem;
}

.company-head h3,
.company-head p {
  margin: 0;
}

.company-head h3 {
  color: #0f172a;
}

.aircraft-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}

.aircraft-card {
  display: grid;
  min-height: 260px;
  align-content: start;
  gap: 0.65rem;
  border-radius: 8px;
  padding: 0.85rem;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.aircraft-card:hover {
  border-color: rgba(96, 165, 250, 0.36);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
  transform: translateY(-3px);
}

.aircraft-photo {
  position: relative;
  display: grid;
  min-height: 128px;
  overflow: hidden;
  place-items: center;
  border-radius: 8px;
  background: #f1f5f9;
}

.aircraft-photo img,
.drawer-media img,
.drawer-gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aircraft-photo span,
.drawer-media-empty span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 900;
  text-transform: uppercase;
}

.aircraft-photo-empty {
  border: 1px dashed #cbd5e1;
}

.aircraft-topline,
.card-foot,
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.aircraft-icon {
  display: grid;
  width: 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 8px;
  background: #eff6ff;
}

.aircraft-title span,
.mini-label {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;
}

.aircraft-title h4 {
  margin: 0.16rem 0;
  color: #0f172a;
  font-size: 1rem;
  letter-spacing: 0;
}

.aircraft-title p {
  margin: 0;
  font-size: 0.84rem;
}

.aircraft-specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
}

.aircraft-specs span {
  min-width: 0;
  overflow: hidden;
  border-radius: 8px;
  padding: 0.42rem 0.5rem;
  color: #334155;
  background: #f8fafc;
  font-size: 0.72rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-list,
.drawer-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 0.32rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.28rem 0.5rem;
  color: #475569;
  background: #f8fafc;
  font-size: 0.7rem;
  font-weight: 900;
}

.chip-success {
  border-color: rgba(34, 197, 94, 0.28);
  color: #166534;
  background: rgba(34, 197, 94, 0.12);
}

.chip-warning {
  border-color: rgba(245, 158, 11, 0.3);
  color: #92400e;
  background: rgba(245, 158, 11, 0.12);
}

.chip-danger {
  border-color: rgba(239, 68, 68, 0.3);
  color: #991b1b;
  background: rgba(239, 68, 68, 0.12);
}

.chip-info {
  border-color: rgba(59, 130, 246, 0.3);
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.12);
}

.card-foot button {
  color: #1d4ed8;
  background: #eff6ff;
  padding: 0.45rem 0.65rem;
}

.actions-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
}

.actions-row button {
  min-height: 2.2rem;
  color: #ffffff;
  font-size: 0.74rem;
}

.action-approve {
  background: #16a34a;
}

.action-reject {
  background: #64748b;
}

.action-suspend {
  background: #dc2626;
}

.export-button:hover,
.card-foot button:hover,
.filter-panel button:hover,
.drawer-head button:hover,
.empty-state button:hover,
.actions-row button:hover {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
  transform: translateY(-1px);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-radius: 8px;
  padding: 1rem;
}

.empty-state button {
  color: #111827;
  background: #bfdbfe;
  padding: 0.7rem 0.9rem;
}

.drawer-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.32);
}

.document-preview-scrim {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(15, 23, 42, 0.55);
}

.detail-drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 41;
  display: grid;
  width: min(440px, 100vw);
  height: 100vh;
  align-content: start;
  gap: 1rem;
  overflow-y: auto;
  border-left: 1px solid #e5e7eb;
  color: #0f172a;
  background: #ffffff;
  padding: 1rem;
  box-shadow: -22px 0 70px rgba(0, 0, 0, 0.35);
}

.document-preview {
  position: fixed;
  inset: 3vh 3vw;
  z-index: 51;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.35);
}

.document-preview header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.85rem 1rem;
}

.document-preview h3 {
  margin: 0.15rem 0 0;
  color: #0f172a;
  font-size: 1rem;
}

.document-preview button {
  border: 0;
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  color: #0f172a;
  background: #f1f5f9;
  font-weight: 900;
}

.document-preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  background: #f8fafc;
}

.drawer-media {
  display: grid;
  min-height: 150px;
  overflow: hidden;
  place-items: center;
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(15, 118, 110, 0.1)),
    #f8fafc;
  color: #2563eb;
  font-size: 3rem;
}

.drawer-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.drawer-gallery img {
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #f1f5f9;
}

.drawer-head h3,
.drawer-head p,
.drawer-section h4,
.drawer-section dl {
  margin: 0;
}

.drawer-head button {
  color: #0f172a;
  background: #f1f5f9;
  padding: 0.62rem 0.8rem;
}

.drawer-section {
  display: grid;
  gap: 0.7rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.9rem;
  background: #ffffff;
}

.drawer-section h4 {
  color: #0f172a;
}

.drawer-section dl {
  display: grid;
  gap: 0.65rem;
}

.drawer-section div {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.drawer-section dd {
  margin: 0;
  color: #0f172a;
  font-weight: 800;
  text-align: right;
}

.document-list {
  display: grid;
  gap: 0.6rem;
}

.document-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f8fafc;
}

.document-item > div {
  display: grid;
  min-width: 0;
  gap: 0.35rem;
}

.document-item strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 0.88rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-item small,
.document-item p,
.documents-empty,
.document-missing {
  margin: 0;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 700;
}

.document-open,
.document-missing {
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 900;
  text-decoration: none;
}

.document-open {
  color: #ffffff;
  background: #2563eb;
}

.document-open:disabled {
  cursor: wait;
  opacity: 0.7;
}

.document-missing {
  color: #64748b;
  background: #e2e8f0;
}

.documents-empty,
.document-error {
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f8fafc;
}

.document-error {
  border-color: #fecaca;
  color: #991b1b;
  background: #fef2f2;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active,
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.2s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}

@media (max-width: 1180px) {
  .kpi-grid,
  .aircraft-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .aircraft-command,
  .filter-panel {
    padding: 0.85rem;
  }

  .command-hero,
  .search-row,
  .empty-state {
    display: grid;
  }

  .kpi-grid,
  .aircraft-grid,
  .filter-groups,
  .subscription-grid,
  .meta-grid,
  .actions-row {
    grid-template-columns: 1fr;
  }

  .detail-drawer {
    width: 100vw;
  }

  .document-preview {
    inset: 0;
    border-radius: 0;
  }

  .aircraft-specs,
  .drawer-gallery {
    grid-template-columns: 1fr;
  }

  .document-item {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
