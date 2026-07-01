<script setup>
import { computed, ref, watch } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'

const props = defineProps({
  assignments: { type: Array, required: true },
  isLoading: { type: Boolean, default: false },
  actionState: {
    type: Object,
    default: () => ({
      active: false,
      title: '',
      detail: '',
      tone: 'success',
    }),
  },
})

const emit = defineEmits([
  'confirm',
  'reject',
  'request-change',
  'confirm-briefing',
  'mark-cabin-ready',
  'mark-passengers-ready',
  'start-service',
  'finalize-service',
])

const selectedAssignmentId = ref(null)

const selectedAssignment = computed(
  () => props.assignments.find((item) => item.id === selectedAssignmentId.value) || props.assignments[0] || null,
)
const expandedStageId = ref('availability')
const missionProgressSteps = [
  { id: 'availability', label: 'Disponibilidad' },
  { id: 'itinerary', label: 'Itinerario' },
  { id: 'presentation', label: 'Presentacion' },
  { id: 'cabin', label: 'Cabina' },
  { id: 'passengers', label: 'Pasajeros' },
  { id: 'service', label: 'Servicio' },
  { id: 'layover', label: 'Escala / tramo' },
  { id: 'closing', label: 'Cierre' },
  { id: 'admin-closing', label: 'Cierre admin' },
]

const nextAction = computed(() => {
  const item = selectedAssignment.value
  if (!item) {
    return {
      title: 'Sin mision activa',
      detail:
        'Actualmente no tienes una operacion asignada. Cuando Admin / Red Sky te asigne un vuelo, aqui veras itinerario, briefing, checklist y cierre operativo.',
      cta: '',
      event: '',
    }
  }

  if (item.canRespondToAssignment) {
    return {
      title: 'Siguiente accion',
      detail: 'Confirma disponibilidad con Admin / Red Sky y revisa ruta, horario de presentacion y briefing.',
      cta: 'Confirmar al Admin',
      event: 'confirm',
    }
  }

  if (item.canCheckin) {
    return {
      title: 'Siguiente accion',
      detail: `Presentate en aeropuerto/base. Hora limite: ${item.briefingTime || item.time || 'Pendiente por Admin'} · Lugar: ${item.originName || item.origin || 'Pendiente por Admin'}.`,
      cta: 'Confirmar llegada a aeropuerto/base',
      event: 'confirm-briefing',
    }
  }

  if (item.canMarkCabinReady) {
    return {
      title: 'Siguiente accion',
      detail: 'Revisa cabina, catering, limpieza e insumos antes del abordaje.',
      cta: 'Revisar cabina y catering',
      event: 'mark-cabin-ready',
    }
  }

  if (item.canReceivePassengers) {
    return {
      title: 'Siguiente accion',
      detail: 'Recibe pasajeros, valida necesidades especiales y confirma lista de abordaje.',
      cta: 'Recibir pasajeros',
      event: 'mark-passengers-ready',
    }
  }

  if (item.canStartService) {
    return {
      title: 'Siguiente accion',
      detail: 'Inicia el servicio a bordo y mantente en coordinacion con Admin / Red Sky si surge una incidencia.',
      cta: 'Atender servicio en vuelo',
      event: 'start-service',
    }
  }

  if (item.canFinalizeService) {
    return {
      title: 'Siguiente accion',
      detail: 'Cierra el servicio, registra observaciones y deja trazabilidad del vuelo.',
      cta: 'Cerrar servicio',
      event: 'finalize-service',
    }
  }

  return {
    title: 'Operacion en cierre',
    detail: 'La operacion ya completo su flujo principal. Solo queda consulta y seguimiento administrativo.',
    cta: '',
    event: '',
  }
})

const checklistStages = computed(() => {
  const item = selectedAssignment.value
  if (!item) return []

  const missionState = String(item.missionStatus || '').trim()

  return [
    {
      id: 'availability',
      label: 'Disponibilidad',
      state: item.canRespondToAssignment ? 'Pendiente' : 'Confirmado',
      points: [
        'Confirmar disponibilidad con Admin / Red Sky',
        'Revisar fecha, hora y ruta',
        'Confirmar horario de presentacion',
      ],
    },
    {
      id: 'itinerary',
      label: 'Itinerario',
      state: item.flight || item.route ? 'Recibido' : 'Pendiente de carga',
      points: [
        'Revisar itinerario y briefing recibido',
        'Confirmar aeropuerto/base de salida',
        'Validar pasajeros y aeronave',
      ],
    },
    {
      id: 'presentation',
      label: 'Presentacion',
      state: item.canCheckin ? 'Pendiente' : item.crewCheckinAt ? 'Completado' : 'Pendiente',
      points: [
        'Llegar a aeropuerto/base',
        'Presentarse con personal operativo',
        'Confirmar briefing recibido',
      ],
    },
    {
      id: 'cabin',
      label: 'Cabina y catering',
      state: item.canMarkCabinReady ? 'Pendiente' : ['Cabina revisada', 'Pasajeros recibidos', 'En servicio', 'Finalizado'].includes(missionState) ? 'Completado' : 'Pendiente',
      points: [
        'Revisar limpieza de cabina',
        'Verificar catering y bebidas',
        'Confirmar insumos y amenidades',
        'Reportar faltantes a Admin, si aplica',
      ],
    },
    {
      id: 'passengers',
      label: 'Pasajeros',
      state: item.canReceivePassengers ? 'Pendiente' : ['Pasajeros recibidos', 'En servicio', 'Finalizado'].includes(missionState) ? 'Completado' : 'Pendiente',
      points: [
        'Recibir pasajeros',
        'Validar cantidad contra lista',
        'Confirmar necesidades especiales',
        'Dar indicaciones basicas de seguridad',
      ],
    },
    {
      id: 'service',
      label: 'Servicio en vuelo',
      state: item.canStartService ? 'Pendiente' : ['En servicio', 'Finalizado'].includes(missionState) ? 'Completado' : 'Pendiente',
      points: [
        'Atiende servicio durante el vuelo',
        'Mantener cabina limpia y ordenada',
        'Atender solicitudes del cliente',
        'Supervisar seguridad y cinturones',
      ],
    },
    {
      id: 'layover',
      label: 'Escala / siguiente tramo',
      state: ['En escala / siguiente tramo', 'Reporte enviado', 'Finalizado'].includes(missionState) ? 'Completado' : 'Pendiente',
      points: [
        'Apoya en desembarque / escala / siguiente tramo',
        'Verificar pasajeros que bajan o suben',
        'Revisar cabina despues del tramo',
        'Reponer insumos, si aplica',
        'Confirmar catering del siguiente tramo',
      ],
    },
    {
      id: 'closing',
      label: 'Cierre',
      state: item.canFinalizeService ? 'Pendiente' : missionState === 'Finalizado' ? 'Completado' : 'Pendiente',
      points: [
        'Apoyar en desembarque',
        'Revisar objetos olvidados',
        'Registrar faltantes o danos',
        'Reporta incidencias y cierre al Admin',
      ],
    },
    {
      id: 'admin-closing',
      label: 'Cierre administrativo',
      state: missionState === 'Finalizado' ? 'Completado' : 'Pendiente admin',
      points: [
        'Admin cierra la operacion',
        'Se resguarda la trazabilidad final del servicio',
        'La asignacion queda lista para consulta e historial',
      ],
    },
  ]
})

const selectedQuickSummary = computed(() => {
  const item = selectedAssignment.value
  if (!item) return []

  return [
    { label: 'Folio', value: item.flight || `OP-${item.id}` },
    { label: 'Ruta', value: item.route || 'Pendiente por Admin' },
    { label: 'Aeronave', value: item.aircraft || 'Pendiente por Admin' },
    { label: 'Presentacion', value: item.briefingTime || item.time || 'Pendiente por Admin' },
    { label: 'Pasajeros', value: item.passengers ? `${item.passengers} pax` : 'Sin dato' },
    { label: 'Estado actual', value: nextAction.value.cta || item.crewStatusLabel || item.missionStatus || 'Pendiente' },
  ]
})

const missionProgress = computed(() =>
  missionProgressSteps.map((step) => {
    const stage = checklistStages.value.find((item) => item.id === step.id)
    return {
      ...step,
      state: stage?.state || 'Pendiente',
      tone: stageTone(stage?.state || 'Pendiente'),
    }
  }),
)

const secondaryActions = computed(() => {
  const item = selectedAssignment.value
  if (!item || !item.canRespondToAssignment) return []

  return [
    { id: 'reject', label: 'Rechazar al Admin', icon: 'incident' },
    { id: 'request-change', label: 'Solicitar cambio', icon: 'route' },
  ]
})

watch(
  () => props.assignments,
  (items) => {
    if (!items.length) {
      selectedAssignmentId.value = null
      return
    }
    if (!items.some((item) => item.id === selectedAssignmentId.value)) {
      selectedAssignmentId.value = items[0].id
    }
  },
  { immediate: true },
)

watch(
  () => checklistStages.value,
  (items) => {
    if (!items.length) {
      expandedStageId.value = ''
      return
    }

    if (!items.some((item) => item.id === expandedStageId.value)) {
      expandedStageId.value = items[0].id
    }
  },
  { immediate: true },
)

function formatDateTime(date = '', time = '') {
  const source = [date, time].filter(Boolean).join('T')
  if (!source) return 'Por definir'
  const normalized = source.includes('T') ? source : `${source}T08:00`
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return [date, time].filter(Boolean).join(' · ') || 'Por definir'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function toggleStage(stageId = '') {
  expandedStageId.value = expandedStageId.value === stageId ? '' : stageId
}

function triggerPrimaryAction() {
  const item = selectedAssignment.value
  if (!item || !nextAction.value?.event) return
  emit(nextAction.value.event, item.id)
}

function triggerSecondaryAction(actionId = '') {
  const item = selectedAssignment.value
  if (!item || !actionId) return
  emit(actionId, item.id)
}

function stageTone(state = '') {
  const normalized = String(state || '').trim().toLowerCase()
  if (normalized.includes('completado') || normalized.includes('confirmado') || normalized.includes('recibido')) return 'ok'
  if (normalized.includes('no aplica')) return 'neutral'
  return 'pending'
}
</script>

<template>
  <section class="assignments-page">
    <div class="page-head surface" :class="{ 'page-head--loading': isLoading }">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="assignment" :size="20" /></span>
          <div>
            <span class="eyebrow">Operacion</span>
            <h3>Mi mision asignada</h3>
          </div>
        </div>
        <p class="muted">
          Aqui ves el itinerario, briefing, cliente y requerimientos operativos del servicio. Toda la coordinacion pasa por Admin / Red Sky.
        </p>
      </div>
      <span class="badge">{{ isLoading ? 'Sincronizando' : `${assignments.length} activas` }}</span>
    </div>

    <div class="content-grid">
      <section class="surface assignments-list-card">
        <div v-if="isLoading" class="assignments-loading-shell" aria-live="polite" aria-busy="true">
          <div class="loading-banner">
            <div class="loading-orbit">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div>
              <strong>Sincronizando mision operativa</strong>
              <p>Estamos preparando itinerario, briefing, checklist y estatus del servicio.</p>
            </div>
          </div>

          <div class="loading-layout">
            <div class="loading-stack">
              <article v-for="item in 3" :key="`assignment-skeleton-${item}`" class="loading-card shimmer-card">
                <span class="skeleton skeleton-line skeleton-line--title"></span>
                <span class="skeleton skeleton-line skeleton-line--medium"></span>
                <span class="skeleton skeleton-line skeleton-line--soft"></span>
                <div class="loading-card__meta">
                  <span class="skeleton skeleton-pill"></span>
                  <span class="skeleton skeleton-pill skeleton-pill--muted"></span>
                </div>
              </article>
            </div>

            <article class="loading-detail shimmer-card">
              <div class="loading-detail__hero">
                <span class="skeleton skeleton-line skeleton-line--title"></span>
                <span class="skeleton skeleton-line skeleton-line--medium"></span>
                <div class="loading-chip-row">
                  <span v-for="item in 4" :key="`chip-${item}`" class="skeleton skeleton-pill"></span>
                </div>
              </div>

              <div class="loading-summary-grid">
                <span v-for="item in 6" :key="`summary-${item}`" class="skeleton skeleton-panel"></span>
              </div>

              <div class="loading-checklist-grid">
                <span v-for="item in 4" :key="`check-${item}`" class="skeleton skeleton-panel skeleton-panel--tall"></span>
              </div>
            </article>
          </div>
        </div>

        <template v-else>
        <div class="section-head">
          <span class="mini-icon"><CrewUiIcon name="flight" :size="17" /></span>
          <h4>Operacion activa</h4>
        </div>
        <article v-if="!assignments.length" class="empty-state-card">
          <strong>Sin mision activa</strong>
          <p>
            Actualmente no tienes una operacion asignada. Cuando Admin / Red Sky te asigne un vuelo, aqui veras el itinerario, briefing, checklist y cierre operativo.
          </p>
        </article>
        <div class="assignment-list">
          <article
            v-for="item in assignments"
            :key="item.id"
            class="assignment-row"
            :class="{ 'assignment-row--selected': item.id === selectedAssignment?.id }"
            @click="selectedAssignmentId = item.id"
          >
            <div>
              <strong>{{ [item.flight, item.route].filter(Boolean).join(' - ') || 'Operacion sin referencia completa' }}</strong>
              <p>{{ [item.date, item.time, item.aircraft].filter(Boolean).join(' - ') || 'Pendiente por Admin' }}</p>
              <small>{{ [item.client, item.passengers ? `${item.passengers} pax` : '', item.serviceLevel].filter(Boolean).join(' - ') || 'Cliente o servicio pendiente por Admin' }}</small>
              <small>{{ [item.vipRequirements, item.briefingTime ? `Briefing ${item.briefingTime}` : ''].filter(Boolean).join(' - ') || 'Briefing o requerimientos pendientes por Admin' }}</small>
              <small v-if="item.internalContact">{{ item.internalContact }}</small>
            </div>
            <div class="row-side">
              <div class="action-stack">
                <span class="badge">{{ item.responseStatus }}</span>
                <span class="badge">{{ item.crewStatusLabel || item.missionStatus }}</span>
              </div>
              <button class="ghost-button action-button row-select-button" type="button" @click.stop="selectedAssignmentId = item.id">
                Ver detalle
              </button>
            </div>
          </article>
        </div>

        <article v-if="selectedAssignment" class="assignment-detail-card">
          <div class="hero-strip">
            <div class="hero-strip__header">
              <div>
                <strong>{{ [selectedAssignment.flight, selectedAssignment.route].filter(Boolean).join(' - ') || 'Operacion sin referencia completa' }}</strong>
                <p>{{ [selectedAssignment.date, selectedAssignment.time, selectedAssignment.aircraft].filter(Boolean).join(' - ') || 'Pendiente por Admin' }}</p>
              </div>
              <div class="hero-strip__badges">
                <span class="badge">{{ selectedAssignment.responseStatus }}</span>
                <span class="badge">{{ selectedAssignment.crewStatusLabel || selectedAssignment.missionStatus }}</span>
              </div>
            </div>

            <div class="quick-summary-grid">
              <article v-for="item in selectedQuickSummary" :key="item.label" class="quick-summary-card">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </article>
            </div>

            <div class="progress-strip">
              <article v-for="step in missionProgress" :key="step.id" class="progress-chip" :data-tone="step.tone">
                <span>{{ step.label }}</span>
                <strong>{{ step.state }}</strong>
              </article>
            </div>
          </div>

          <div class="section-head">
            <span class="mini-icon"><CrewUiIcon name="route" :size="17" /></span>
            <h4>{{ nextAction.title }}</h4>
          </div>
          <div class="next-action-card">
            <div class="next-action-copy">
              <strong>{{ nextAction.cta || (selectedAssignment.crewStatusLabel || selectedAssignment.missionStatus) }}</strong>
              <p>{{ nextAction.detail }}</p>
            </div>
            <div class="next-action-controls">
              <button
                v-if="nextAction.cta"
                class="primary-action action-button next-action-button"
                type="button"
                :disabled="props.actionState?.active"
                @click="triggerPrimaryAction"
              >
                <CrewUiIcon name="checklist" :size="16" />
                {{ props.actionState?.active ? 'Procesando...' : nextAction.cta }}
              </button>
              <div v-if="secondaryActions.length" class="secondary-actions">
                <button
                  v-for="action in secondaryActions"
                  :key="action.id"
                  class="ghost-button action-button secondary-action-button"
                  type="button"
                  :disabled="props.actionState?.active"
                  @click="triggerSecondaryAction(action.id)"
                >
                  <CrewUiIcon :name="action.icon" :size="15" />
                  {{ action.label }}
                </button>
              </div>
            </div>
          </div>

          <div class="section-head">
            <span class="mini-icon"><CrewUiIcon name="briefing" :size="17" /></span>
            <h4>Detalle de operacion</h4>
          </div>

          <div class="detail-grid">
            <div class="detail-item">
              <span>Folio</span>
              <strong>{{ selectedAssignment.flight || `OP-${selectedAssignment.id}` }}</strong>
            </div>
            <div class="detail-item">
              <span>Fecha / hora</span>
              <strong>{{ formatDateTime(selectedAssignment.date, selectedAssignment.time || selectedAssignment.briefingTime) }}</strong>
            </div>
            <div class="detail-item">
              <span>Ruta</span>
              <strong>{{ selectedAssignment.route || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Aeronave</span>
              <strong>{{ selectedAssignment.aircraft || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Hora de presentacion</span>
              <strong>{{ selectedAssignment.briefingTime || selectedAssignment.time || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Lugar de presentacion</span>
              <strong>{{ selectedAssignment.originName || selectedAssignment.origin || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Cliente</span>
              <strong>{{ selectedAssignment.client || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Pasajeros</span>
              <strong>{{ selectedAssignment.passengers ? `${selectedAssignment.passengers} pax` : 'Sin dato' }}</strong>
            </div>
            <div class="detail-item">
              <span>Catering</span>
              <strong>{{ selectedAssignment.catering || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item">
              <span>Servicio</span>
              <strong>{{ selectedAssignment.serviceLevel || 'Pendiente por Admin' }}</strong>
            </div>
            <div class="detail-item detail-item--wide">
              <span>Requerimientos especiales</span>
              <strong>{{ selectedAssignment.specialRequirements || selectedAssignment.vipRequirements || 'No confirmado aun' }}</strong>
            </div>
            <div class="detail-item detail-item--wide">
              <span>Contacto interno</span>
              <strong>{{ selectedAssignment.internalContact || 'Admin / Red Sky' }}</strong>
            </div>
          </div>

          <div class="section-head">
            <span class="mini-icon"><CrewUiIcon name="checklist" :size="17" /></span>
            <h4>Checklist operativo</h4>
          </div>
          <div class="checklist-summary">
            <article
              v-for="item in checklistStages"
              :key="item.id"
              class="checklist-stage"
              :data-tone="stageTone(item.state)"
              :data-open="expandedStageId === item.id"
            >
              <button class="checklist-stage__head" type="button" @click="toggleStage(item.id)">
                <div class="checklist-stage__title">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.state }}</strong>
                </div>
                <span class="checklist-stage__toggle">{{ expandedStageId === item.id ? 'Ocultar' : 'Ver detalle' }}</span>
              </button>
              <div v-if="expandedStageId === item.id" class="checklist-stage__body">
                <ul class="checklist-stage__points">
                  <li v-for="point in item.points" :key="point">{{ point }}</li>
                </ul>
              </div>
            </article>
          </div>
        </article>
        </template>

      </section>
    </div>
  </section>
  <Teleport to="body">
    <div
      v-if="props.actionState?.active"
      class="assignment-action-modal"
      role="status"
      aria-live="polite"
    >
      <div class="assignment-action-surface" :class="`assignment-action-surface--${props.actionState.tone || 'success'}`">
        <div class="assignment-action-orb" aria-hidden="true">
          <span v-if="props.actionState.tone === 'success' && props.actionState.title?.includes('Confirmado')">✓</span>
          <template v-else>
            <i></i>
            <i></i>
            <i></i>
          </template>
        </div>
        <p class="eyebrow">Operacion</p>
        <h3>{{ props.actionState.title }}</h3>
        <p class="muted">{{ props.actionState.detail }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.assignments-page,
.content-grid,
.assignment-list {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.assignments-list-card {
  padding: 1.4rem;
}

.page-head--loading {
  position: relative;
  overflow: hidden;
}

.page-head--loading::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 3px;
  background: linear-gradient(90deg, rgba(10, 143, 91, 0), rgba(10, 143, 91, 0.75), rgba(212, 177, 84, 0.7), rgba(10, 143, 91, 0));
  background-size: 200% 100%;
  animation: assignments-loading-bar 1.8s linear infinite;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.title-row,
.section-head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.icon-badge,
.mini-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #0a8f5b;
}

.assignment-action-modal {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background:
    radial-gradient(circle at top, rgba(194, 138, 18, 0.14), transparent 34%),
    rgba(248, 246, 241, 0.76);
  backdrop-filter: blur(12px);
}

.assignment-action-surface {
  display: grid;
  gap: 0.8rem;
  width: min(420px, 100%);
  padding: 2rem 1.8rem;
  border-radius: 28px;
  border: 1px solid rgba(214, 199, 173, 0.8);
  background: linear-gradient(180deg, rgba(255, 253, 248, 0.98) 0%, rgba(245, 239, 228, 0.96) 100%);
  text-align: center;
  box-shadow:
    0 28px 70px rgba(24, 20, 14, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
  transform: translateY(-2vh);
}

.assignment-action-surface h3,
.assignment-action-surface .muted {
  margin: 0;
}

.assignment-action-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 4.2rem;
  height: 4.2rem;
  margin: 0 auto 0.2rem;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fffaf0 0%, #e8d5a6 42%, #c28a12 100%);
  box-shadow: 0 18px 32px rgba(194, 138, 18, 0.22);
  color: #1d1a14;
  font-size: 1.8rem;
  font-weight: 800;
}

.assignment-action-orb i {
  position: absolute;
  width: 4.2rem;
  height: 4.2rem;
  border-radius: inherit;
  border: 1px solid rgba(194, 138, 18, 0.24);
  animation: assignment-action-pulse 1.7s ease-out infinite;
}

.assignment-action-orb i:nth-child(2) {
  animation-delay: 0.22s;
}

.assignment-action-orb i:nth-child(3) {
  animation-delay: 0.44s;
}

@keyframes assignment-action-pulse {
  0% {
    transform: scale(0.84);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.28);
    opacity: 0;
  }
}

.icon-badge {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.05));
}

.page-head,
.assignment-row {
  display: flex;
  gap: 1rem;
}

.page-head {
  align-items: end;
  justify-content: space-between;
}

.page-head h3,
.assignments-list-card h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.page-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.content-grid {
  grid-template-columns: minmax(0, 1fr);
}

.assignments-list-card {
  border: 1px solid rgba(10, 143, 91, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 250, 0.97));
}

.assignments-loading-shell,
.loading-stack,
.loading-layout,
.loading-detail,
.loading-detail__hero,
.loading-summary-grid,
.loading-checklist-grid,
.loading-banner {
  display: grid;
  gap: 1rem;
}

.loading-banner {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(10, 143, 91, 0.12);
  border-radius: 18px;
  background:
    radial-gradient(circle at left top, rgba(10, 143, 91, 0.12), transparent 36%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(243, 250, 247, 0.97));
}

.loading-banner strong {
  color: #111111;
}

.loading-banner p {
  margin: 0.25rem 0 0;
  color: #596761;
  line-height: 1.6;
}

.loading-orbit {
  position: relative;
  width: 3rem;
  height: 3rem;
}

.loading-orbit span {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 1px solid rgba(10, 143, 91, 0.16);
  animation: assignments-orbit 2.6s ease-in-out infinite;
}

.loading-orbit span:nth-child(2) {
  inset: 0.35rem;
  border-color: rgba(212, 177, 84, 0.2);
  animation-delay: 180ms;
}

.loading-orbit span:nth-child(3) {
  inset: 0.7rem;
  border-color: rgba(10, 143, 91, 0.28);
  animation-delay: 360ms;
}

.loading-layout {
  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.3fr);
  align-items: start;
}

.loading-card,
.loading-detail {
  padding: 1.05rem;
  border-radius: 18px;
  border: 1px solid rgba(10, 143, 91, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 250, 247, 0.96));
}

.loading-card__meta,
.loading-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.loading-summary-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.loading-checklist-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.skeleton {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(10, 143, 91, 0.08);
}

.shimmer-card .skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
  animation: assignments-shimmer 1.45s ease-in-out infinite;
}

.skeleton-line {
  display: block;
  height: 0.9rem;
}

.skeleton-line--title {
  width: 68%;
  height: 1.15rem;
}

.skeleton-line--medium {
  width: 48%;
}

.skeleton-line--soft {
  width: 82%;
}

.skeleton-pill {
  width: 6.2rem;
  height: 2rem;
}

.skeleton-pill--muted {
  width: 7.5rem;
}

.skeleton-panel {
  display: block;
  min-height: 4.8rem;
  border-radius: 16px;
}

.skeleton-panel--tall {
  min-height: 6.8rem;
}

.assignment-row {
  align-items: start;
  justify-content: space-between;
  padding: 1.1rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 248, 0.95));
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease;
}

.assignment-row:hover {
  transform: translateY(-2px);
  border-color: rgba(10, 143, 91, 0.16);
  box-shadow: 0 18px 42px rgba(10, 31, 21, 0.06);
}

.assignment-row--selected {
  border-color: rgba(10, 143, 91, 0.2);
  box-shadow: 0 0 0 2px rgba(10, 143, 91, 0.08);
}

.assignment-row strong {
  color: #111111;
  line-height: 1.2;
}

.assignment-row p,
.assignment-row small {
  margin: 0.3rem 0 0;
  color: #596761;
  line-height: 1.55;
}

.action-stack {
  display: grid;
  gap: 0.55rem;
  width: min(100%, 180px);
  flex-shrink: 0;
}

.row-side {
  display: grid;
  gap: 0.8rem;
  justify-items: end;
}

.row-select-button {
  min-width: 9rem;
}

.action-button {
  gap: 0.45rem;
}

.action-button:disabled {
  opacity: 0.46;
  cursor: not-allowed;
  filter: saturate(0.7);
}

.empty-state-card,
.next-action-card {
  display: grid;
  gap: 0.55rem;
  padding: 1rem 1.05rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(244, 250, 247, 0.96));
}

.empty-state-card strong,
.next-action-card strong {
  color: #111111;
}

.empty-state-card p,
.next-action-card p {
  margin: 0;
  color: #596761;
  line-height: 1.6;
}

.assignment-detail-card {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(244, 250, 247, 0.96));
}

.hero-strip {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid rgba(10, 143, 91, 0.1);
  background:
    radial-gradient(circle at top left, rgba(10, 143, 91, 0.08), transparent 34%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(242, 249, 246, 0.98));
}

.hero-strip__header,
.hero-strip__badges {
  display: flex;
  gap: 0.8rem;
}

.hero-strip__header {
  align-items: start;
  justify-content: space-between;
}

.hero-strip__header strong {
  display: block;
  color: #111111;
  line-height: 1.2;
}

.hero-strip__header p {
  margin: 0.35rem 0 0;
  color: #596761;
}

.hero-strip__badges {
  flex-wrap: wrap;
  justify-content: end;
}

.quick-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.quick-summary-card {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(10, 143, 91, 0.08);
  background: rgba(255, 255, 255, 0.92);
}

.quick-summary-card span {
  color: #596761;
  font-size: 0.78rem;
}

.quick-summary-card strong {
  color: #111111;
  line-height: 1.35;
}

.progress-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.progress-chip {
  display: grid;
  gap: 0.12rem;
  padding: 0.65rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(212, 177, 84, 0.24);
  background: rgba(255, 255, 255, 0.92);
}

.progress-chip[data-tone='ok'] {
  border-color: rgba(10, 143, 91, 0.16);
  background: rgba(233, 247, 240, 0.96);
}

.progress-chip[data-tone='neutral'] {
  border-color: rgba(120, 133, 127, 0.18);
  background: rgba(246, 248, 247, 0.96);
}

.progress-chip span {
  color: #596761;
  font-size: 0.72rem;
}

.progress-chip strong {
  color: #111111;
  font-size: 0.84rem;
  line-height: 1.2;
}

.next-action-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
}

.next-action-copy {
  display: grid;
  gap: 0.45rem;
}

.next-action-controls,
.secondary-actions {
  display: grid;
  gap: 0.7rem;
}

.next-action-button,
.secondary-action-button {
  min-width: 15rem;
  justify-content: center;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.detail-item {
  display: grid;
  gap: 0.25rem;
  padding: 0.85rem 0.9rem;
  border-radius: 14px;
  border: 1px solid rgba(10, 143, 91, 0.08);
  background: #fff;
}

.detail-item span {
  color: #596761;
  font-size: 0.78rem;
}

.detail-item strong {
  color: #111111;
  line-height: 1.35;
}

.detail-item--wide {
  grid-column: 1 / -1;
}

.checklist-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.checklist-stage {
  display: grid;
  gap: 0.35rem;
  padding: 0.2rem;
  border-radius: 14px;
  border: 1px solid rgba(10, 143, 91, 0.08);
  background: #fff;
}

.checklist-stage[data-tone='ok'] {
  border-color: rgba(10, 143, 91, 0.16);
}

.checklist-stage[data-tone='pending'] {
  border-color: rgba(212, 177, 84, 0.24);
}

.checklist-stage__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  width: 100%;
  padding: 0.85rem 0.9rem;
  border: 0;
  background: transparent;
  text-align: left;
}

.checklist-stage__title {
  display: grid;
  gap: 0.25rem;
}

.checklist-stage span,
.checklist-stage__toggle {
  color: #596761;
  font-size: 0.78rem;
}

.checklist-stage strong {
  color: #111111;
  line-height: 1.35;
}

.checklist-stage__toggle {
  font-weight: 700;
  white-space: nowrap;
}

.checklist-stage__body {
  padding: 0 0.9rem 0.9rem;
}

.checklist-stage__points {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  padding-left: 1.15rem;
  color: #596761;
}

@media (max-width: 1080px) {
  .content-grid,
  .detail-grid,
  .checklist-summary,
  .quick-summary-grid,
  .next-action-card,
  .loading-layout,
  .loading-summary-grid,
  .loading-checklist-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .assignment-row {
    display: grid;
  }

  .title-row,
  .section-head {
    align-items: flex-start;
  }

  .page-head,
  .assignments-list-card {
    padding: 1.05rem;
  }

  .page-head .badge,
  .assignment-row,
  .action-stack {
    width: 100%;
  }

  .assignment-row {
    gap: 0.8rem;
  }

  .row-side,
  .hero-strip__header,
  .hero-strip__badges {
    justify-items: stretch;
    justify-content: flex-start;
  }

  .hero-strip__header,
  .next-action-card {
    display: grid;
  }

  .loading-banner {
    grid-template-columns: 1fr;
  }

  .action-stack .action-button {
    justify-content: center;
  }

  .assignment-row strong,
  .assignment-row p,
  .assignment-row small,
  .quick-summary-card strong {
    overflow-wrap: anywhere;
  }
}

@keyframes assignments-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@keyframes assignments-loading-bar {
  100% {
    background-position: 200% 0;
  }
}

@keyframes assignments-orbit {
  0%,
  100% {
    transform: scale(0.96);
    opacity: 0.42;
  }
  50% {
    transform: scale(1.04);
    opacity: 1;
  }
}
</style>
