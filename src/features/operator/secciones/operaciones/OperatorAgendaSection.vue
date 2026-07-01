<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  agendaForm: { type: Object, required: true },
  agendaErrors: { type: Object, required: true },
  agendaItems: { type: Array, required: true },
  requests: { type: Array, required: true },
  eventTypes: { type: Array, required: true },
  regions: { type: Array, required: true },
  priorityOptions: { type: Array, required: true },
  responsibles: { type: Array, required: true },
})

defineEmits(['update-field', 'create'])

const activeRange = ref('today')

function normalizeDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

const filteredAgendaItems = computed(() => {
  if (activeRange.value === 'week') return props.agendaItems

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  return props.agendaItems.filter((item) => {
    const itemDate = normalizeDate(item.date)
    if (!itemDate) return activeRange.value === 'today'
    if (activeRange.value === 'tomorrow') return itemDate.getTime() === tomorrow.getTime()
    return itemDate.getTime() === now.getTime()
  })
})
</script>

<template>
  <section class="agenda-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Agenda</span>
        <h3>Agenda operativa del día</h3>
        <p class="muted">
          Organiza briefings, vuelos, responsables y prioridades sin empalmes operativos.
        </p>
      </div>

      <button class="primary-action" type="button" @click="$emit('create')">
        + Crear evento
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Eventos hoy</span>
        <strong>{{ agendaItems.length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Briefings</span>
        <strong>{{ agendaItems.filter(item => item.type === 'Briefing').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Vuelos</span>
        <strong>{{ agendaItems.filter(item => item.type === 'Vuelo').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Alta prioridad</span>
        <strong>{{ agendaItems.filter(item => item.priority === 'Alta').length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <!-- AGENDA PRINCIPAL -->
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Agenda del día</h4>
            <p class="muted">Visualiza qué sigue, quién responde y qué requiere prioridad inmediata.</p>
          </div>

          <div class="agenda-filters">
            <button type="button" class="filter-chip" :class="{ active: activeRange === 'today' }" @click="activeRange = 'today'">Hoy</button>
            <button type="button" class="filter-chip" :class="{ active: activeRange === 'tomorrow' }" @click="activeRange = 'tomorrow'">Mañana</button>
            <button type="button" class="filter-chip" :class="{ active: activeRange === 'week' }" @click="activeRange = 'week'">Semana</button>
          </div>
        </div>

        <div class="timeline-grid">
          <article
            v-for="item in filteredAgendaItems"
            :key="item.id"
            class="timeline-row"
            :class="{
              'is-briefing': item.type === 'Briefing',
              'is-flight': item.type === 'Vuelo',
              'is-high': item.priority === 'Alta'
            }"
          >
            <span class="timeline-line"></span>

            <strong class="time-block">
              {{ item.startTime }} - {{ item.endTime }}
            </strong>

            <div class="timeline-content">
              <div class="timeline-top">
                <span>{{ item.type }} · {{ item.region }}</span>
                <span class="badge">Prioridad {{ item.priority }}</span>
              </div>

              <p>{{ item.responsible }}</p>

              <small>{{ item.notes }}</small>
            </div>
          </article>
        </div>
      </section>

      <!-- FORMULARIO -->
      <section class="surface form-card">
        <div class="form-head">
          <h4>Programar evento</h4>
          <p class="muted">
            Crea eventos internos ligados a una reserva o responsable operativo.
          </p>
        </div>

        <div class="form-grid">
          <label>
            <span>Tipo de evento</span>
            <select
              :value="agendaForm.type"
              @change="$emit('update-field', { form: 'agenda', field: 'type', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in eventTypes" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Reserva relacionada</span>
            <select
              :value="agendaForm.requestId"
              @change="$emit('update-field', { form: 'agenda', field: 'requestId', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option
                v-for="item in requests"
                :key="item.id"
                :value="String(item.id)"
              >
                #{{ item.id }} · {{ item.client }}
              </option>
            </select>
            <small v-if="agendaErrors.requestId">{{ agendaErrors.requestId }}</small>
          </label>

          <label>
            <span>Fecha</span>
            <input
              :value="agendaForm.date"
              type="date"
              @input="$emit('update-field', { form: 'agenda', field: 'date', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Hora inicio</span>
            <input
              :value="agendaForm.startTime"
              type="time"
              @input="$emit('update-field', { form: 'agenda', field: 'startTime', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Hora fin</span>
            <input
              :value="agendaForm.endTime"
              type="time"
              @input="$emit('update-field', { form: 'agenda', field: 'endTime', value: $event.target.value })"
            />
            <small v-if="agendaErrors.endTime">{{ agendaErrors.endTime }}</small>
          </label>

          <label>
            <span>Responsable</span>
            <select
              :value="agendaForm.responsible"
              @change="$emit('update-field', { form: 'agenda', field: 'responsible', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option
                v-for="item in responsibles"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Región</span>
            <select
              :value="agendaForm.region"
              @change="$emit('update-field', { form: 'agenda', field: 'region', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in regions" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Prioridad</span>
            <select
              :value="agendaForm.priority"
              @change="$emit('update-field', { form: 'agenda', field: 'priority', value: $event.target.value })"
            >
              <option
                v-for="item in priorityOptions"
                :key="item"
                :value="item"
              >
                {{ item }}
              </option>
            </select>
          </label>

          <label class="full-width">
            <span>Notas operativas</span>
            <textarea
              :value="agendaForm.notes"
              rows="3"
              placeholder="Briefing ejecutivo, traslado, seguimiento, coordinación..."
              @input="$emit('update-field', { form: 'agenda', field: 'notes', value: $event.target.value })"
            ></textarea>
            <small v-if="agendaErrors.schedule">{{ agendaErrors.schedule }}</small>
          </label>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.agenda-page,
.content-grid,
.timeline-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.form-card,
.list-card,
.kpi-card {
  padding: 1rem;
}

.page-head,
.section-head,
.timeline-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3,
.form-card h4,
.list-card h4 {
  margin: 0;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  border-radius: 18px;
}

.kpi-card span {
  display: block;
  color: #70675c;
  font-size: 0.85rem;
}

.kpi-card strong {
  display: block;
  margin-top: 0.35rem;
  font-size: 1.45rem;
}

.content-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
  align-items: start;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
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

.agenda-filters {
  display: flex;
  gap: 0.5rem;
}

.filter-chip {
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(201, 169, 107, 0.22);
  background: transparent;
  cursor: pointer;
}

.filter-chip.active {
  background: #111;
  color: white;
}

.timeline-row {
  display: grid;
  grid-template-columns: 6px 140px 1fr;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: var(--surface-premium);
  border: 1px solid rgba(201, 169, 107, 0.14);
}

.timeline-line {
  border-radius: 999px;
  background: #c8a96b;
}

.is-briefing .timeline-line {
  background: #c8a96b;
}

.is-flight .timeline-line {
  background: #2563eb;
}

.is-high .timeline-line {
  background: #b42318;
}

.time-block {
  font-size: 1rem;
}

.timeline-content p,
.timeline-content small {
  margin: 0.3rem 0 0;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head,
  .timeline-row {
    display: grid;
    grid-template-columns: 1fr;
  }

  .agenda-filters {
    flex-wrap: wrap;
  }
}
</style>
