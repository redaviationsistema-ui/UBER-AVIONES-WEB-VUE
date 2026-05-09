<script setup>
import CrewUiIcon from './CrewUiIcon.vue'

defineProps({
  agendaItems: { type: Array, required: true },
  agendaBlockForm: { type: Object, required: true },
  agendaErrors: { type: Object, required: true },
  agendaStates: { type: Array, required: true },
  blockTypes: { type: Array, required: true },
})

defineEmits(['update-field', 'confirm-flight', 'mark-en-camino', 'mark-briefing', 'mark-service', 'mark-finalizado', 'request-block'])
</script>

<template>
  <section class="agenda-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="agenda" :size="20" /></span>
          <div>
            <span class="eyebrow">Agenda</span>
            <h3>Agenda operativa</h3>
          </div>
        </div>
        <p class="muted">
          Puedes confirmar asistencia, marcar en camino, llegar a briefing o pedir bloqueo de disponibilidad propia, pero no eliminar vuelos asignados.
        </p>
      </div>
      <button class="primary-action action-button" type="button" @click="$emit('request-block')">
        <CrewUiIcon name="block" :size="16" />
        Solicitar bloqueo
      </button>
    </div>

    <div class="content-grid">
      <section class="surface block-card">
        <div class="section-head">
          <span class="mini-icon"><CrewUiIcon name="block" :size="17" /></span>
          <h4>Bloqueo de disponibilidad</h4>
        </div>
        <div class="form-grid">
          <label>
            <span>Estado de agenda</span>
            <select
              :value="agendaBlockForm.state"
              @change="$emit('update-field', { form: 'agendaBlock', field: 'state', value: $event.target.value })"
            >
              <option v-for="item in agendaStates" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label>
            <span>Tipo de bloqueo</span>
            <select
              :value="agendaBlockForm.blockType"
              @change="$emit('update-field', { form: 'agendaBlock', field: 'blockType', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in blockTypes" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>

          <label class="full-width">
            <span>Motivo</span>
            <textarea
              :value="agendaBlockForm.reason"
              rows="3"
              @input="$emit('update-field', { form: 'agendaBlock', field: 'reason', value: $event.target.value })"
            ></textarea>
            <small v-if="agendaErrors.reason">{{ agendaErrors.reason }}</small>
            <small v-if="agendaErrors.conflict">{{ agendaErrors.conflict }}</small>
          </label>
        </div>
      </section>

      <section class="surface agenda-list-card">
        <div class="section-head">
          <span class="mini-icon"><CrewUiIcon name="flight" :size="17" /></span>
          <h4>Vuelos y agenda</h4>
        </div>
        <div class="agenda-list">
          <article v-for="item in agendaItems" :key="item.id" class="agenda-row">
            <div>
              <strong>{{ item.flight }} - {{ item.route }}</strong>
              <p>{{ item.date }} - {{ item.time }} - {{ item.aircraft }}</p>
              <small>{{ item.briefing }} - {{ item.serviceLevel }} - {{ item.vipRequirements }}</small>
            </div>
            <div class="action-stack">
              <span class="badge">{{ item.state }}</span>
              <button class="ghost-button action-button" type="button" @click="$emit('confirm-flight', item.id)">
                <CrewUiIcon name="assignment" :size="15" />
                Confirmar vuelo
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('mark-en-camino', item.id)">
                <CrewUiIcon name="route" :size="15" />
                Marcar en camino
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('mark-briefing', item.id)">
                <CrewUiIcon name="briefing" :size="15" />
                Llegada a briefing
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('mark-service', item.id)">
                <CrewUiIcon name="service" :size="15" />
                Servicio iniciado
              </button>
              <button class="ghost-button action-button" type="button" @click="$emit('mark-finalizado', item.id)">
                <CrewUiIcon name="checklist" :size="15" />
                Servicio finalizado
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.agenda-page,
.content-grid,
.agenda-list {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.block-card,
.agenda-list-card {
  padding: 1.4rem;
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

.icon-badge {
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.14), rgba(10, 143, 91, 0.05));
}

.page-head,
.agenda-row {
  display: flex;
  gap: 1rem;
}

.page-head {
  align-items: end;
  justify-content: space-between;
}

.page-head h3,
.block-card h4,
.agenda-list-card h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.page-head h3 {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.content-grid {
  grid-template-columns: minmax(0, 0.9fr) minmax(340px, 1.1fr);
}

.block-card,
.agenda-list-card {
  border: 1px solid rgba(10, 143, 91, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 252, 250, 0.97));
}

.form-grid {
  display: grid;
  gap: 1rem;
  margin-top: 1.15rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
}

.full-width {
  grid-column: 1 / -1;
}

.form-grid small {
  color: #b42318;
}

.agenda-row {
  align-items: start;
  justify-content: space-between;
  padding: 1.1rem;
  border: 1px solid rgba(10, 143, 91, 0.08);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 251, 248, 0.95));
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.agenda-row:hover {
  transform: translateY(-2px);
  border-color: rgba(10, 143, 91, 0.16);
  box-shadow: 0 18px 42px rgba(10, 31, 21, 0.06);
}

.agenda-row strong {
  color: #111111;
}

.agenda-row p,
.agenda-row small {
  margin: 0.3rem 0 0;
  color: #596761;
  line-height: 1.55;
}

.action-stack {
  display: grid;
  gap: 0.55rem;
  width: min(100%, 240px);
  flex-shrink: 0;
}

.action-button {
  gap: 0.45rem;
}

@media (max-width: 1080px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .agenda-row {
    display: grid;
  }

  .title-row,
  .section-head {
    align-items: flex-start;
  }

  .page-head,
  .block-card,
  .agenda-list-card {
    padding: 1.05rem;
  }

  .page-head > .action-button,
  .agenda-row,
  .action-stack {
    width: 100%;
  }

  .page-head > .action-button,
  .action-stack .action-button {
    justify-content: center;
  }

  .agenda-row {
    gap: 0.8rem;
  }

  .agenda-row strong,
  .agenda-row p,
  .agenda-row small {
    overflow-wrap: anywhere;
  }
}
</style>
