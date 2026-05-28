<script setup>
import { computed } from 'vue'
import AdminReservationsSection from './AdminReservationsSection.vue'

const props = defineProps({
  reservations: { type: Array, required: true },
  auditEntries: { type: Array, default: () => [] },
  isFlowLoading: { type: Boolean, default: false },
  flowLoadingLabel: { type: String, default: '' },
})

defineEmits(['update-flow', 'delay-flow', 'resume-flow'])

function hasProviderRelease(reservation = {}) {
  const raw = reservation?.raw && typeof reservation.raw === 'object' ? reservation.raw : {}
  return Boolean(
    raw.provider_operational_release ||
      raw.operational_release ||
      raw.release_checklist ||
      raw.visibility_payload?.provider_operational_release ||
      raw.visibility_payload?.operational_status ||
      raw.operational_ready ||
      raw.crew_confirmed ||
      raw.aircraft_confirmed,
  )
}

const filteredReservations = computed(() =>
  props.reservations.filter((reservation) => hasProviderRelease(reservation)),
)

function resolveReleaseStatus(reservation = {}) {
  const raw = reservation?.raw && typeof reservation.raw === 'object' ? reservation.raw : {}
  return String(
    raw.provider_operational_release?.status ||
      raw.operational_release?.status ||
      raw.release_checklist?.status ||
      raw.visibility_payload?.provider_operational_release?.status ||
      raw.visibility_payload?.operational_status ||
      (raw.operational_ready ? 'operational_ready' : '') ||
      (raw.crew_confirmed ? 'crew_confirmed' : '') ||
      (raw.aircraft_confirmed ? 'aircraft_confirmed' : '') ||
      'pending',
  )
    .trim()
    .toLowerCase()
}

const releaseStageCards = computed(() => {
  const counts = {
    pending: 0,
    aircraft_confirmed: 0,
    crew_confirmed: 0,
    operational_ready: 0,
  }

  filteredReservations.value.forEach((reservation) => {
    const status = resolveReleaseStatus(reservation)
    if (status === 'operational_ready') counts.operational_ready += 1
    else if (status === 'crew_confirmed') counts.crew_confirmed += 1
    else if (status === 'aircraft_confirmed') counts.aircraft_confirmed += 1
    else counts.pending += 1
  })

  return [
    {
      id: 'pending',
      label: 'Pendiente',
      value: counts.pending,
      detail: 'Captura inicial del proveedor.',
      tone: 'muted',
    },
    {
      id: 'aircraft_confirmed',
      label: 'Aeronave confirmada',
      value: counts.aircraft_confirmed,
      detail: 'Disponibilidad y cobertura ya validadas.',
      tone: 'warning',
    },
    {
      id: 'crew_confirmed',
      label: 'Tripulacion confirmada',
      value: counts.crew_confirmed,
      detail: 'La validacion tecnica ya avanzo.',
      tone: 'warning',
    },
    {
      id: 'operational_ready',
      label: 'Lista para confirmacion',
      value: counts.operational_ready,
      detail: 'Liberaciones listas para revision final.',
      tone: 'success',
    },
  ]
})
</script>

<template>
  <section class="admin-releases-page">
    <article class="release-overview surface">
      <div class="release-overview__copy">
        <p class="eyebrow">Liberaciones</p>
        <h2>Liberacion operativa del proveedor</h2>
        <p class="muted">
          Sigue el avance operativo del proveedor en una cabina separada: disponibilidad real,
          tripulacion tecnica, despacho y alistamiento final antes de confirmar el vuelo.
        </p>
      </div>

      <div class="release-overview__grid">
        <article
          v-for="card in releaseStageCards"
          :key="card.id"
          class="release-stage-card"
          :data-tone="card.tone"
        >
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <small>{{ card.detail }}</small>
        </article>
      </div>
    </article>

    <AdminReservationsSection
      :reservations="filteredReservations"
      :audit-entries="auditEntries"
      :is-flow-loading="isFlowLoading"
      :flow-loading-label="flowLoadingLabel"
      :compact-mode="true"
      :show-admin-flow-panel="false"
      :show-hero-header="false"
      :show-queue-summary="false"
      header-eyebrow="Liberaciones"
      header-title="Bandeja operativa de liberaciones"
      header-description="Revisa muchas liberaciones en una bandeja compacta y abre el detalle lateral de la solicitud seleccionada."
      empty-title="Aun no hay liberaciones operativas"
      empty-description="Cuando el proveedor capture una liberacion operativa, aparecera aqui con su flujo y checklist para seguimiento administrativo."
      @update-flow="$emit('update-flow', $event)"
      @delay-flow="$emit('delay-flow', $event)"
      @resume-flow="$emit('resume-flow', $event)"
    />
  </section>
</template>

<style scoped>
.admin-releases-page,
.release-overview,
.release-overview__copy,
.release-overview__grid {
  display: grid;
  gap: 1rem;
}

.release-overview {
  margin-bottom: 1rem;
  padding: 1.2rem;
  border: 1px solid #eadfc9;
  border-radius: 24px;
  background: linear-gradient(180deg, #fffdfa 0%, #fff8ef 100%);
  box-shadow: 0 24px 60px rgba(145, 108, 36, 0.08);
}

.release-overview__copy h2,
.release-stage-card strong {
  color: #20160d;
}

.release-overview__copy p,
.release-stage-card small,
.release-stage-card span {
  color: #6e6250;
}

.release-overview__grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.release-stage-card {
  padding: 1rem;
  border: 1px solid #eadfc9;
  border-radius: 20px;
  background: #fffdfa;
}

.release-stage-card span,
.release-stage-card strong,
.release-stage-card small {
  display: block;
}

.release-stage-card strong {
  margin: 0.25rem 0;
  font-size: 1.7rem;
}

.release-stage-card[data-tone='warning'] {
  background: #fff5dd;
  border-color: rgba(194, 138, 18, 0.28);
}

.release-stage-card[data-tone='success'] {
  background: #eef9f0;
  border-color: rgba(31, 128, 61, 0.24);
}

.release-stage-card[data-tone='muted'] {
  background: #fbf8f1;
}

@media (max-width: 1180px) {
  .release-overview__grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .release-overview__grid {
    grid-template-columns: 1fr;
  }
}
</style>
