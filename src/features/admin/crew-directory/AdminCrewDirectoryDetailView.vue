<script setup>
import { computed } from 'vue'
import { fallbackLabel, humanizeStatus, ratingNumber, toneClass } from './crewDirectoryShared'

const props = defineProps({
  member: { type: Object, default: null },
  note: { type: String, default: '' },
})

const emit = defineEmits(['update:note', 'approve', 'reject', 'suspend', 'audit'])

const ratingLabel = computed(() => {
  if (!props.member?.rating) return 'Sin rating'
  return `${ratingNumber(props.member.rating).toFixed(1)} / 5`
})
</script>

<template>
  <aside class="surface detail-card">
    <template v-if="member">
      <div class="detail-head">
        <div>
          <p class="eyebrow">Detalle del expediente</p>
          <h4>{{ member.name }}</h4>
          <p class="muted">Panel administrativo separado para revisar, comentar y decidir.</p>
        </div>
        <div class="status-stack">
          <span class="status-chip" :class="toneClass(member.validationState)">
            {{ humanizeStatus(member.validationState) || 'Pendiente' }}
          </span>
          <span class="status-chip" :class="toneClass(member.operationalState)">
            {{ humanizeStatus(member.operationalState) || 'Sin estado' }}
          </span>
        </div>
      </div>

      <div class="detail-grid">
        <div class="info-card">
          <span>Proveedor</span>
          <strong>{{ fallbackLabel(member.providerName, 'Sin proveedor asignado') }}</strong>
        </div>
        <div class="info-card">
          <span>Base</span>
          <strong>{{ fallbackLabel(member.base, 'Sin base asignada') }}</strong>
        </div>
        <div class="info-card">
          <span>Correo</span>
          <strong>{{ fallbackLabel(member.email, 'Sin correo') }}</strong>
        </div>
        <div class="info-card">
          <span>Telefono</span>
          <strong>{{ fallbackLabel(member.phone, 'Sin telefono') }}</strong>
        </div>
        <div class="info-card">
          <span>Certificaciones</span>
          <strong>{{ fallbackLabel(member.certificationStatus, 'Sin expediente') }}</strong>
        </div>
        <div class="info-card">
          <span>Rating</span>
          <strong>{{ ratingLabel }}</strong>
        </div>
      </div>

      <div v-if="member.alerts?.length" class="alerts-block">
        <strong>Alertas operativas</strong>
        <ul>
          <li v-for="alert in member.alerts" :key="alert">{{ alert }}</li>
        </ul>
      </div>

      <label class="field">
        <span>Nota administrativa</span>
        <textarea
          :value="note"
          rows="5"
          placeholder="Agrega criterio de aprobacion, observaciones o seguimiento"
          @input="$emit('update:note', $event.target.value)"
        ></textarea>
      </label>

      <div class="actions-grid">
        <button type="button" class="primary-action primary-action--success" @click="$emit('approve')">Aprobar</button>
        <button type="button" class="ghost-button ghost-button--danger" @click="$emit('reject')">Rechazar</button>
        <button type="button" class="ghost-button" @click="$emit('suspend')">Suspender</button>
        <button type="button" class="ghost-button" @click="$emit('audit')">Registrar auditoria</button>
      </div>
    </template>

    <p v-else class="empty-state">
      Selecciona un sobrecargo del directorio para ver su expediente distribuido en este panel lateral.
    </p>
  </aside>
</template>

<style scoped>
.detail-card {
  color: #0f172a;
  padding: 1.3rem;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.92);
}

.eyebrow {
  color: #c88412;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h4 {
  margin: 0.25rem 0 0.35rem;
  color: #0f172a;
}

.muted {
  color: rgba(51, 65, 85, 0.78);
}

.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.status-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.detail-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 1rem;
}

.info-card {
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(226, 232, 240, 0.95);
}

.info-card span {
  color: rgba(100, 116, 139, 0.95);
  font-weight: 600;
}

.info-card strong {
  color: #0f172a;
}

.alerts-block {
  margin-bottom: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  background: rgba(248, 113, 113, 0.08);
  color: #7f1d1d;
}

.alerts-block ul {
  margin: 0.55rem 0 0;
  padding-left: 1rem;
}

.field {
  display: grid;
  gap: 0.45rem;
  margin-bottom: 1rem;
}

.field span {
  color: rgba(71, 85, 105, 0.95);
  font-weight: 700;
}

.field textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 0.9rem 1rem;
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
}

.actions-grid {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (max-width: 640px) {
  .detail-grid,
  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>
