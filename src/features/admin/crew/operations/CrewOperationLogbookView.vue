<script setup>
import { computed, ref } from 'vue'
import { buildCrewOperationWorkflowSnapshot } from '../../../operations/utils/crewOperationWorkflow'

const props = defineProps({
  operation: { type: Object, default: null },
  formatDateTime: { type: Function, required: true },
})

const selectedEvidence = ref(null)

function normalizeChecklistState(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['completed', 'correcto', 'ok', 'done', 'completado'].includes(normalized)) return 'completed'
  if (['not_applicable', 'not applicable', 'na', 'no aplica'].includes(normalized)) return 'not_applicable'
  if (['failed', 'issue', 'falla', 'falla reportada'].includes(normalized)) return 'failed'
  return 'pending'
}

function normalizeToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function checklistItemIndicator(status = '') {
  if (status === 'completed') return '✓'
  if (status === 'not_applicable') return '—'
  if (status === 'failed') return '⚠'
  return '○'
}

function checklistItemLabel(status = '') {
  if (status === 'completed') return 'Registrado'
  if (status === 'not_applicable') return 'No aplica'
  if (status === 'failed') return 'Falla reportada'
  return 'Pendiente'
}

function checklistItemTone(status = '', isCurrent = false) {
  if (status === 'completed') return 'completed'
  if (status === 'not_applicable') return 'not-applicable'
  if (status === 'failed') return 'failed'
  return isCurrent ? 'current' : 'pending'
}

function humanizeChecklistType(value = '') {
  const normalized = normalizeToken(value)
  const labels = {
    tracking: 'Seguimiento',
    seguimiento: 'Seguimiento',
    preparation: 'Preparación',
    preparacion: 'Preparación',
    preflight: 'Checklist pre-vuelo',
    postflight: 'Checklist post-vuelo',
  }
  return labels[normalized] || value || 'Checklist'
}

function humanizeChecklistCategory(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  const labels = {
    personal: 'Documentación personal',
    logistics: 'Traslado y presentación',
    operation: 'Información del vuelo',
    passengers: 'Pasajeros',
    service: 'Servicio',
    cabin: 'Cabina',
    safety: 'Seguridad',
  }

  return labels[normalized] || value || 'General'
}

function resolveMediaUrl(value = '') {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return ''
}

function formatEvidenceDate(value = '') {
  if (!value) return 'Sin fecha'
  return props.formatDateTime(value)
}

function resolveActorName(source = {}, fallback = '') {
  const actor = String(
    source?.created_by_name ||
    source?.updated_by_name ||
    source?.recorded_by_name ||
    source?.registered_by_name ||
    source?.performed_by_name ||
    source?.actor_name ||
    source?.author_name ||
    source?.user_name ||
    source?.crew_name ||
    source?.sobrecargo_name ||
    source?.created_by?.name ||
    source?.updated_by?.name ||
    source?.recorded_by?.name ||
    source?.registered_by?.name ||
    source?.performed_by?.name ||
    source?.actor?.name ||
    source?.author?.name ||
    fallback ||
    '',
  ).trim()

  return actor
}

function itemRecordMeta(item = {}) {
  const parts = []
  if (item.timestamp) parts.push(props.formatDateTime(item.timestamp))
  if (item.actorName) parts.push(item.actorName)
  return parts.join(' · ')
}

function resolveActorRole(source = {}, actorName = '', operationCrew = '') {
  const explicitRole = normalizeToken(
    source?.actor_role ||
    source?.actor_type ||
    source?.user_role ||
    source?.created_by_role ||
    source?.updated_by_role ||
    source?.recorded_by_role ||
    '',
  )

  if (explicitRole.includes('admin')) return 'Admin'
  if (explicitRole.includes('system') || explicitRole.includes('sistema')) return 'Sistema'
  if (explicitRole.includes('crew') || explicitRole.includes('sobrecargo') || explicitRole.includes('cabina')) return 'Sobrecargo'

  const normalizedActor = normalizeToken(actorName)
  const normalizedCrew = normalizeToken(operationCrew)

  if (!normalizedActor) return ''
  if (normalizedActor === 'sistema' || normalizedActor === 'system') return 'Sistema'
  if (normalizedCrew && normalizedActor.includes(normalizedCrew)) return 'Sobrecargo'
  if (normalizedActor.includes('admin') || normalizedActor.includes('administracion')) return 'Admin'

  return ''
}

function normalizeChecklistItem(item = {}, checklistType = 'general', index = 0) {
  const status = normalizeChecklistState(item.status)
  const actorName = resolveActorName(item)
  return {
    id: item.id || item.code || item.label || item.name || `${checklistType}-${index}`,
    title: item.label || item.description || item.name || item.code || 'Checklist sin nombre',
    category: item.category || 'general',
    status,
    detail: checklistItemLabel(status),
    timestamp: item.completed_at || item.updated_at || item.recorded_at || item.created_at || '',
    actorName,
    actorRole: resolveActorRole(item, actorName, props.operation?.crew || ''),
  }
}

function buildChecklistSummary(items = []) {
  const resolved = items.filter((item) => item.status !== 'pending').length
  return {
    total: items.length,
    resolved,
    pending: items.filter((item) => item.status === 'pending').length,
    completed: items.filter((item) => item.status === 'completed').length,
    failed: items.filter((item) => item.status === 'failed').length,
  }
}

function findLatestTimelineEntry(timeline = [], { statuses = [], titleIncludes = [] } = {}) {
  const normalizedStatuses = statuses.map((status) => normalizeToken(status)).filter(Boolean)
  const normalizedTitles = titleIncludes.map((title) => normalizeToken(title)).filter(Boolean)

  const matches = (Array.isArray(timeline) ? timeline : []).filter((entry) => {
    const status = normalizeToken(entry?.status || '')
    const title = normalizeToken(entry?.title || '')
    return normalizedStatuses.includes(status) || normalizedTitles.some((value) => title.includes(value))
  })

  return matches
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left?.created_at || left?.updated_at || '')
      const rightTime = Date.parse(right?.created_at || right?.updated_at || '')
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    })[0] || null
}

function buildDerivedTrackingStage(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const latestOperation = raw.latestOperation && typeof raw.latestOperation === 'object' ? raw.latestOperation : {}
  const timeline = [
    ...(Array.isArray(raw.timeline) ? raw.timeline : []),
    ...(Array.isArray(nestedOperation.timeline) ? nestedOperation.timeline : []),
    ...(Array.isArray(latestOperation.timeline) ? latestOperation.timeline : []),
  ]
  const workflowStatus = normalizeToken(operation?.workflowStatus || operation?.status || raw.workflow_status || raw.status || '')
  const hasIncident = Number(operation?.incidentsCount || raw.incidents_count || 0) > 0

  const items = [
    {
      title: 'Llegué al aeropuerto',
      entry: findLatestTimelineEntry(timeline, { statuses: ['crew_checkin', 'checked_in'], titleIncludes: ['llegue al aeropuerto'] }),
      doneOn: ['checked in', 'preflight in progress', 'cabin ready', 'boarding', 'boarding completed', 'in flight', 'landed', 'postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Aeronave lista',
      entry: findLatestTimelineEntry(timeline, { statuses: ['cabina_lista', 'cabin_ready'], titleIncludes: ['aeronave lista'] }),
      doneOn: ['cabin ready', 'boarding', 'boarding completed', 'in flight', 'landed', 'postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Pasajeros recibidos',
      entry: findLatestTimelineEntry(timeline, { statuses: ['pasajeros_recibidos', 'boarding_completed'], titleIncludes: ['pasajeros recibidos'] }),
      doneOn: ['boarding completed', 'in flight', 'landed', 'postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Despegue',
      entry: findLatestTimelineEntry(timeline, { statuses: ['in_flight'], titleIncludes: ['despegue'] }),
      doneOn: ['in flight', 'landed', 'postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Aterrizaje',
      entry: findLatestTimelineEntry(timeline, { statuses: ['landed'], titleIncludes: ['aterriz'] }),
      doneOn: ['landed', 'postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Pasajeros desembarcaron',
      entry: findLatestTimelineEntry(timeline, { statuses: ['postflight_pending', 'report_pending', 'crew_completed'], titleIncludes: ['desembar'] }),
      doneOn: ['postflight pending', 'report pending', 'crew completed', 'administratively closed'],
    },
    {
      title: 'Checklist post-vuelo',
      entry: findLatestTimelineEntry(timeline, { statuses: ['crew_completed', 'administratively_closed'], titleIncludes: ['postvuelo'] }),
      doneOn: ['crew completed', 'administratively closed'],
    },
  ].map((item, index, list) => {
    let status = 'pending'
    if (item.entry) {
      status = 'completed'
    } else if (item.doneOn.includes(workflowStatus)) {
      status = item.title === 'Checklist post-vuelo' && hasIncident ? 'failed' : 'completed'
    } else if (list.slice(0, index).every((candidate) => candidate.entry || candidate.doneOn.includes(workflowStatus))) {
      status = 'current'
    }

    const actorName = resolveActorName(item.entry, operation?.crew || '')
    return {
      id: `tracking-${index}`,
      title: item.title,
      status,
      detail: status === 'current' ? 'Pendiente' : checklistItemLabel(status),
      timestamp: item.entry?.created_at || item.entry?.updated_at || '',
      actorName,
      actorRole: resolveActorRole(item.entry, actorName, operation?.crew || ''),
    }
  })

  return {
    id: 'tracking-stage',
    type: 'tracking',
    title: 'Seguimiento',
    items,
    summary: buildChecklistSummary(items.map((item) => ({ ...item, status: item.status === 'current' ? 'pending' : item.status }))),
  }
}

function groupCategoryItems(items = []) {
  const buckets = new Map()

  items.forEach((item) => {
    const key = String(item.category || 'general')
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        label: humanizeChecklistCategory(key),
        items: [],
      })
    }

    buckets.get(key).items.push(item)
  })

  return Array.from(buckets.values()).map((group) => ({
    ...group,
    summary: buildChecklistSummary(group.items),
  }))
}

function normalizeStage(group = {}, index = 0) {
  const checklistType = group.type || group.category || `group-${index + 1}`
  const items = Array.isArray(group.items)
    ? group.items.map((item, itemIndex) => normalizeChecklistItem(item, checklistType, itemIndex))
    : []
  if (!items.length) return null

  return {
    id: group.id || checklistType || `checklist-group-${index + 1}`,
    type: normalizeToken(checklistType),
    title: humanizeChecklistType(checklistType),
    items,
    categories: groupCategoryItems(items),
    summary: buildChecklistSummary(items),
  }
}

function extractEvidenceCards(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const sources = [
    raw.evidences,
    raw.evidence,
    raw.files,
    raw.images,
    raw.photos,
    nestedOperation.evidences,
    nestedOperation.files,
    nestedOperation.images,
    nestedOperation.photos,
  ].filter(Array.isArray)

  return sources
    .flatMap((source) => source)
    .map((item, index) => {
      const url = resolveMediaUrl(item?.url || item?.file_url || item?.image_url || item?.photo_url || item?.path || '')
      return {
        id: item?.id || `evidence-${index}`,
        title: item?.label || item?.type || item?.name || item?.category || `Evidencia ${index + 1}`,
        status: url ? 'completed' : 'pending',
        url,
        date: item?.created_at || item?.uploaded_at || item?.updated_at || '',
      }
    })
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
}

function extractIncidents(operation = {}) {
  const raw = operation?.raw && typeof operation.raw === 'object' ? operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const sources = [raw.incidents, nestedOperation.incidents, raw.crew_operation_incidents].filter(Array.isArray)

  return sources
    .flatMap((source) => source)
    .map((incident, index) => ({
      id: incident?.id || `incident-${index}`,
      title: incident?.category || incident?.title || 'Incidencia',
      description: incident?.description || incident?.detail || incident?.admin_response || '',
      status: incident?.status || 'open',
      date: incident?.created_at || incident?.updated_at || '',
      evidenceUrl: resolveMediaUrl(
        incident?.files?.[0]?.file_url ||
        incident?.files?.[0]?.url ||
        incident?.file_url ||
        '',
      ),
    }))
}

function stageTone(stage = {}) {
  const stepStatus = String(stage.workflowStep?.status || '').trim()
  if (stepStatus === 'completed') return 'completed'
  if (stepStatus === 'current') return 'current'
  if (stepStatus === 'available') return 'pending'
  return 'pending'
}

function stageSummaryDetail(stage = {}) {
  const summary = stage.summary || { resolved: 0, total: 0 }
  const status = String(stage.workflowStep?.status || '').trim()
  const hasItems = Number(summary.total || 0) > 0
  const isChecklistStage = ['preparation', 'preflight', 'postflight'].includes(stage.type)

  if (isChecklistStage && !hasItems) {
    return 'Detalle no disponible'
  }

  if (status === 'blocked') {
    if (stage.type === 'tracking') return 'Se habilitará al completar el checklist pre-vuelo'
    if (stage.type === 'postflight') return 'Se habilitará al completar seguimiento'
    if (stage.type === 'preflight') return 'Se habilitará al completar preparación'
    return 'Se habilitará al completar el paso anterior'
  }

  if (status === 'current') {
    if (stage.type === 'tracking') return 'Paso actual del workflow'
    return hasItems ? `${summary.resolved} de ${summary.total || 0} completados` : 'Detalle no disponible'
  }

  if (status === 'available') {
    return hasItems ? `${summary.resolved} de ${summary.total || 0} completados` : 'Detalle no disponible'
  }

  if (stage.type === 'tracking') return `${summary.resolved} de ${summary.total || 0} eventos registrados`
  return hasItems ? `${summary.resolved} de ${summary.total || 0} completados` : 'Detalle no disponible'
}

function stageScoreLabel(stage = {}) {
  const summary = stage.summary || { resolved: 0, total: 0 }
  const isChecklistStage = ['preparation', 'preflight', 'postflight'].includes(stage.type)
  if (isChecklistStage && Number(summary.total || 0) === 0) return '—'
  return `${summary.resolved}/${summary.total || 0}`
}

function categorySummaryDetail(category = {}) {
  const summary = category.summary || { resolved: 0, total: 0 }
  return `${summary.resolved}/${summary.total || 0}`
}

const operationSnapshot = computed(() =>
  props.operation ? buildCrewOperationWorkflowSnapshot(props.operation) : null,
)

const normalizedStages = computed(() => {
  if (operationSnapshot.value) {
    const workflowSteps = operationSnapshot.value.workflow?.stepsById || new Map()
    const groupsByType = operationSnapshot.value.checklistGroupsByType || new Map()
    const snapshotStages = [
      {
        id: 'preparation-stage',
        type: 'preparation',
        title: 'Preparación',
        items: groupsByType.get('preparation')?.items || [],
        categories: groupsByType.get('preparation')?.categories || [],
        summary: groupsByType.get('preparation')?.summary || { resolved: 0, total: 0, pending: 0, failed: 0 },
        workflowStep: workflowSteps.get('preparation') || null,
      },
      {
        id: 'preflight-stage',
        type: 'preflight',
        title: 'Checklist pre-vuelo',
        items: groupsByType.get('preflight')?.items || [],
        categories: groupsByType.get('preflight')?.categories || [],
        summary: groupsByType.get('preflight')?.summary || { resolved: 0, total: 0, pending: 0, failed: 0 },
        workflowStep: workflowSteps.get('checklist') || null,
      },
      {
        id: 'tracking-stage',
        type: 'tracking',
        title: operationSnapshot.value.tracking.title,
        items: operationSnapshot.value.tracking.items,
        categories: [],
        summary: operationSnapshot.value.tracking.summary,
        workflowStep: workflowSteps.get('tracking') || null,
      },
      {
        id: 'postflight-stage',
        type: 'postflight',
        title: 'Checklist post-vuelo',
        items: groupsByType.get('postflight')?.items || [],
        categories: groupsByType.get('postflight')?.categories || [],
        summary: groupsByType.get('postflight')?.summary || { resolved: 0, total: 0, pending: 0, failed: 0 },
        workflowStep: workflowSteps.get('closure') || null,
      },
    ]

    const ordered = ['preparation', 'preflight', 'tracking', 'postflight']
    const sorted = snapshotStages
      .sort((left, right) => {
        const leftIndex = ordered.indexOf(left.type)
        const rightIndex = ordered.indexOf(right.type)
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
      })

    return sorted.map((stage, index) => ({
      ...stage,
      tone: stageTone(stage),
      openByDefault:
        stage.workflowStep?.current
        || (index === 0 && !sorted.some((candidate) => candidate.type === operationSnapshot.value.workflow.currentId)),
    }))
  }

  if (!props.operation) return []
  const raw = props.operation?.raw && typeof props.operation.raw === 'object' ? props.operation.raw : {}
  const nestedOperation = raw.operation && typeof raw.operation === 'object' ? raw.operation : {}
  const latestOperation = raw.latestOperation && typeof raw.latestOperation === 'object' ? raw.latestOperation : {}
  const source = [
    props.operation?.checklists,
    raw.checklists,
    nestedOperation.checklists,
    latestOperation.checklists,
    raw.visibility_payload?.checklists,
    nestedOperation.visibility_payload?.checklists,
  ].find(Array.isArray) || []

  const normalized = source.map(normalizeStage).filter(Boolean)
  const ordered = ['preparation', 'preflight', 'tracking', 'postflight']

  const stages = normalized.length ? normalized : [buildDerivedTrackingStage(props.operation)]
  const sorted = stages.sort((left, right) => {
    const leftIndex = ordered.indexOf(left.type)
    const rightIndex = ordered.indexOf(right.type)
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex)
  })

  return sorted.map((stage, index) => ({
    ...stage,
    tone: stageTone(stage),
    openByDefault: stageTone(stage) === 'current' || (index === 0 && !sorted.some((candidate) => stageTone(candidate) === 'current')),
  }))
})

const evidenceCards = computed(() => extractEvidenceCards(props.operation || {}))
const incidents = computed(() => extractIncidents(props.operation || {}))

const operationHeader = computed(() => {
  const snapshot = operationSnapshot.value
  const currentStep = snapshot?.workflow?.steps?.find((step) => step.current) || null
  return {
    statusLabel: snapshot?.operationStatusLabel || 'Programada',
    statusTone:
      snapshot?.workflow?.steps?.every((step) => step.complete)
        ? 'completed'
        : currentStep?.id && currentStep.id !== 'validation'
          ? 'current'
          : snapshot?.assignmentStatus === 'confirmed'
            ? 'current'
            : 'pending',
    updatedAt:
      props.operation?.updatedAt ||
      props.operation?.raw?.updated_at ||
      props.operation?.raw?.operation?.updated_at ||
      '',
  }
})
</script>

<template>
  <section v-if="operation" class="logbook-view">
    <header class="operation-head">
      <div>
        <p class="eyebrow">Bitácora de la operación</p>
        <h3>{{ operationSnapshot?.folio || operation.folio || `OP-${operation.id}` }}</h3>
        <p class="route">{{ operationSnapshot?.route || operation.route || '—' }}</p>
        <div class="meta-line">
          <span v-if="operationSnapshot?.ids?.operationId">Operación #{{ operationSnapshot.ids.operationId }}</span>
          <span>{{ formatDateTime(operation.departure) }}</span>
          <span>{{ operation.aircraft || 'Aeronave por definir' }}</span>
          <span>{{ operation.crew || 'Sobrecargo por definir' }}</span>
        </div>
      </div>
      <div class="status-stack">
        <span class="status-pill" :data-tone="operationHeader.statusTone">{{ operationHeader.statusLabel }}</span>
        <small v-if="operationHeader.updatedAt">Última actualización: {{ formatDateTime(operationHeader.updatedAt) }}</small>
      </div>
    </header>

    <section class="stages-accordion">
      <details
        v-for="stage in normalizedStages"
        :key="stage.id"
        class="stage-block"
        :open="stage.openByDefault"
      >
        <summary class="stage-block__head" :data-tone="stage.tone">
          <div class="stage-block__title">
            <span class="stage-block__icon">{{ checklistItemIndicator(stage.tone === 'current' ? 'pending' : stage.tone) }}</span>
            <div class="stage-block__title-copy">
              <strong>{{ stage.title }}</strong>
              <small>{{ stageSummaryDetail(stage) }}</small>
            </div>
          </div>
          <div class="stage-block__score">
            <strong>{{ stageScoreLabel(stage) }}</strong>
          </div>
        </summary>

        <div v-if="stage.type === 'tracking'" class="timeline-list">
          <article
            v-for="item in stage.items"
            :key="item.id"
            class="timeline-item"
            :data-tone="checklistItemTone(item.status, item.status === 'current')"
          >
            <span class="timeline-item__icon">{{ checklistItemIndicator(item.status === 'current' ? 'pending' : item.status) }}</span>
            <div class="timeline-item__copy">
              <strong>{{ item.title }}</strong>
              <small class="timeline-item__state">{{ item.detail }}</small>
              <small v-if="item.timestamp || item.actorName" class="timeline-item__meta">
                {{ itemRecordMeta(item) }}
                <span v-if="item.actorRole" class="actor-tag" :data-role="normalizeToken(item.actorRole)">{{ item.actorRole }}</span>
              </small>
            </div>
          </article>
        </div>

        <div v-else class="checklist-list">
          <article
            v-for="category in stage.categories"
            :key="`${stage.id}-${category.id}`"
            class="checklist-category"
          >
            <header class="checklist-category__head">
              <div>
                <strong>{{ category.label }}</strong>
                <small>{{ categorySummaryDetail(category) }}</small>
              </div>
            </header>

            <div class="checklist-category__items">
              <article
                v-for="item in category.items"
                :key="item.id"
                class="checklist-item"
                :data-tone="checklistItemTone(item.status)"
              >
                <span class="checklist-item__icon">{{ checklistItemIndicator(item.status) }}</span>
                <div class="checklist-item__copy">
                  <strong>{{ item.title }}</strong>
                  <small class="checklist-item__state">{{ item.detail }}</small>
                  <small v-if="item.timestamp || item.actorName" class="checklist-item__meta">
                    {{ itemRecordMeta(item) }}
                    <span v-if="item.actorRole" class="actor-tag" :data-role="normalizeToken(item.actorRole)">{{ item.actorRole }}</span>
                  </small>
                </div>
              </article>
            </div>
          </article>
        </div>
      </details>
    </section>

    <section class="support-grid">
      <article class="support-card">
        <div class="support-card__head">
          <div>
            <p class="eyebrow">Evidencias</p>
            <h4>Evidencias</h4>
          </div>
        </div>

        <div v-if="evidenceCards.length" class="evidence-grid">
          <article v-for="item in evidenceCards" :key="item.id" class="evidence-item">
            <strong>{{ item.title }}</strong>
            <small>{{ item.status === 'completed' ? 'Cargada' : 'Pendiente' }}</small>
            <button v-if="item.url" type="button" class="mini-action" @click="selectedEvidence = item">Ver</button>
          </article>
        </div>
        <p v-else class="empty-copy">Sin evidencias</p>
      </article>

      <article class="support-card">
        <div class="support-card__head">
          <div>
            <p class="eyebrow">Incidencias</p>
            <h4>Incidencias</h4>
          </div>
        </div>

        <div v-if="incidents.length" class="incident-list">
          <article v-for="incident in incidents" :key="incident.id" class="incident-item">
            <strong>{{ incident.title }}</strong>
            <small>{{ incident.description || 'Falla reportada' }}</small>
            <small>{{ incident.date ? formatDateTime(incident.date) : 'Sin fecha' }}</small>
          </article>
        </div>
        <p v-else class="empty-copy">Sin incidencias</p>
      </article>
    </section>

    <div v-if="selectedEvidence" class="evidence-modal-backdrop" @click.self="selectedEvidence = null">
      <div class="evidence-modal">
        <div class="support-card__head">
          <div>
            <p class="eyebrow">Preview</p>
            <h4>{{ selectedEvidence.title }}</h4>
          </div>
          <button type="button" class="mini-action" @click="selectedEvidence = null">Cerrar</button>
        </div>
        <img v-if="selectedEvidence.url" :src="selectedEvidence.url" :alt="selectedEvidence.title" class="evidence-preview" />
        <div class="evidence-meta">
          <span>Tipo: {{ selectedEvidence.title }}</span>
          <span>Fecha: {{ formatEvidenceDate(selectedEvidence.date) }}</span>
          <span>Sobrecargo: {{ operation.crew || 'Sobrecargo por definir' }}</span>
          <span>Operación: {{ operation.folio || `OP-${operation.id}` }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.logbook-view,
.stages-accordion,
.support-grid,
.evidence-grid,
.incident-list,
.timeline-list,
.checklist-list,
.timeline-item,
.checklist-item {
  display: grid;
}

.logbook-view {
  gap: 1rem;
}

.operation-head,
.stage-block__head,
.support-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.operation-head,
.stage-block,
.support-card,
.evidence-modal {
  border-radius: 24px;
  border: 1px solid rgba(200, 214, 236, 0.8);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 16px 34px rgba(17, 34, 68, 0.06);
}

.operation-head,
.stage-block,
.support-card,
.evidence-modal {
  padding: 1.05rem;
}

.eyebrow {
  margin: 0 0 0.22rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6a81aa;
}

.operation-head h3,
.stage-block__title strong,
.timeline-item__copy strong,
.checklist-item__copy strong,
.support-card h4 {
  margin: 0;
  color: #10233d;
}

.route {
  margin: 0.25rem 0 0;
  font-size: 1rem;
  color: #355477;
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.55rem;
  color: #667d9f;
}

.status-stack {
  display: grid;
  justify-items: end;
  gap: 0.28rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.72rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 800;
  border: 1px solid transparent;
}

.status-pill[data-tone='completed'] {
  border-color: rgba(16, 185, 129, 0.24);
  background: rgba(236, 253, 245, 0.96);
  color: #0f8e65;
}

.status-pill[data-tone='current'] {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 247, 237, 0.96);
  color: #c17b11;
}

.status-pill[data-tone='pending'] {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 252, 0.98);
  color: #64748b;
}

.stage-block__title-copy,
.timeline-item__copy,
.checklist-item__copy {
  display: grid;
  gap: 0.18rem;
}

.actor-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 0.45rem;
  padding: 0.14rem 0.45rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(248, 250, 252, 0.96);
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.actor-tag[data-role='sobrecargo'] {
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(236, 253, 245, 0.9);
  color: #0f8e65;
}

.actor-tag[data-role='admin'] {
  border-color: rgba(59, 130, 246, 0.22);
  background: rgba(239, 246, 255, 0.96);
  color: #2563eb;
}

.actor-tag[data-role='sistema'] {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
}

.timeline-item__icon,
.checklist-item__icon {
  display: grid;
  place-items: center;
  font-weight: 900;
}

.timeline-item__copy small,
.checklist-item__copy small,
.status-stack small,
.empty-copy {
  color: #6f84a6;
}

.stage-block__title {
  display: flex;
  align-items: flex-start;
  gap: 0.72rem;
}

.stage-block__title-copy small,
.timeline-item__meta,
.checklist-item__meta {
  color: #8ba0c0;
}

.stages-accordion {
  gap: 0.85rem;
}

.stage-block {
  gap: 0.9rem;
}

.stage-block summary {
  list-style: none;
  cursor: pointer;
}

.stage-block summary::-webkit-details-marker {
  display: none;
}

.stage-block__head[data-tone='completed'] .stage-block__icon,
.timeline-item[data-tone='completed'] .timeline-item__icon,
.checklist-item[data-tone='completed'] .checklist-item__icon,
.checklist-item[data-tone='completed'] .checklist-item__copy small {
  color: #0f8e65;
}

.stage-block__head[data-tone='current'] .stage-block__icon,
.timeline-item[data-tone='current'] .timeline-item__icon,
.checklist-item[data-tone='current'] .checklist-item__icon,
.checklist-item[data-tone='current'] .checklist-item__copy small {
  color: #c17b11;
}

.stage-block__head[data-tone='failed'] .stage-block__icon,
.timeline-item[data-tone='failed'] .timeline-item__icon,
.checklist-item[data-tone='failed'] .checklist-item__icon,
.checklist-item[data-tone='failed'] .checklist-item__copy small {
  color: #dc2626;
}

.timeline-list,
.checklist-list,
.checklist-category,
.checklist-category__items {
  gap: 0.65rem;
}

.checklist-category {
  padding: 0.95rem;
  border-radius: 20px;
  border: 1px solid rgba(210, 222, 243, 0.82);
  background: linear-gradient(180deg, rgba(247, 250, 255, 0.95), rgba(255, 255, 255, 0.98));
}

.checklist-category__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.checklist-category__head strong {
  color: #10233d;
}

.checklist-category__head small {
  color: #6f84a6;
}

.checklist-item__state,
.timeline-item__state {
  font-weight: 700;
}

.timeline-item,
.checklist-item {
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 0.75rem;
  padding: 0.9rem 0.95rem;
  border-radius: 18px;
  border: 1px solid rgba(206, 219, 240, 0.82);
  background: rgba(255, 255, 255, 0.98);
}

.timeline-item[data-tone='completed'],
.checklist-item[data-tone='completed'] {
  border-color: rgba(16, 185, 129, 0.22);
  background: rgba(236, 253, 245, 0.9);
}

.timeline-item[data-tone='not-applicable'],
.checklist-item[data-tone='not-applicable'] {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 252, 0.98);
}

.timeline-item[data-tone='failed'],
.checklist-item[data-tone='failed'] {
  border-color: rgba(239, 68, 68, 0.22);
  background: rgba(254, 242, 242, 0.94);
}

.timeline-item[data-tone='current'],
.checklist-item[data-tone='current'] {
  border-color: rgba(245, 158, 11, 0.24);
  background: rgba(255, 247, 237, 0.92);
}

.support-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.support-card {
  gap: 0.8rem;
}

.evidence-grid,
.incident-list {
  gap: 0.65rem;
}

.evidence-item,
.incident-item {
  display: grid;
  gap: 0.22rem;
  padding: 0.85rem 0.9rem;
  border-radius: 18px;
  border: 1px solid rgba(206, 219, 240, 0.82);
  background: rgba(249, 251, 255, 0.96);
}

.mini-action {
  width: fit-content;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(116, 149, 210, 0.3);
  background: rgba(239, 246, 255, 0.96);
  color: #32599a;
  font-weight: 800;
  cursor: pointer;
}

.evidence-modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(10, 18, 30, 0.44);
  z-index: 50;
}

.evidence-modal {
  width: min(760px, 100%);
  display: grid;
  gap: 0.85rem;
}

.evidence-preview {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: 18px;
  background: rgba(245, 247, 251, 0.98);
}

.evidence-meta {
  display: grid;
  gap: 0.25rem;
  color: #64748b;
}

@media (max-width: 960px) {
  .support-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .operation-head,
  .stage-block__head,
  .support-card__head {
    display: grid;
  }

  .support-grid {
    grid-template-columns: 1fr;
  }
}
</style>
