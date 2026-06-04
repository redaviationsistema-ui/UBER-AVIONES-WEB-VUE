<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import CrewUiIcon from './CrewUiIcon.vue'
import { searchAirports } from '../../lib/airportSearch'
import { formatAirportOption } from '../../utils/airports'

const props = defineProps({
  profileForm: { type: Object, required: true },
  profileErrors: { type: Object, required: true },
  providerName: { type: String, default: '' },
  currentStatus: { type: String, default: '' },
  documentsValidity: { type: Number, default: 0 },
  profileAlerts: { type: Array, default: () => [] },
  profileRating: { type: String, default: '' },
  bases: { type: Array, required: true },
  languages: { type: Array, required: true },
  profileStates: { type: Array, required: true },
})

const emit = defineEmits(['update-field', 'save'])
const airportSuggestions = ref([])
const airportLoading = ref(false)
const airportOptionsOpen = ref(false)
let airportSearchTimer = null

const editableFields = computed(() =>
  [
    { key: 'name', label: 'Nombre', type: 'text', value: props.profileForm.name, always: true },
    { key: 'phone', label: 'Telefono', type: 'text', value: props.profileForm.phone, always: true, error: props.profileErrors.phone },
    { key: 'email', label: 'Correo', type: 'email', value: props.profileForm.email, always: true, error: props.profileErrors.email },
    { key: 'languages', label: 'Idiomas', type: 'text', value: props.profileForm.languages },
    { key: 'certifications', label: 'Certificaciones', type: 'text', value: props.profileForm.certifications, error: props.profileErrors.certifications },
    { key: 'experience', label: 'Experiencia', type: 'text', value: props.profileForm.experience },
    { key: 'photo', label: 'Foto', type: 'text', value: props.profileForm.photo },
    { key: 'weeklyAvailability', label: 'Disponibilidad semanal', type: 'text', value: props.profileForm.weeklyAvailability },
  ].filter((field) => field.always || String(field.value || '').trim()),
)

const readonlyFields = computed(() =>
  [
    props.profileForm.birthDate
      ? { label: 'Fecha de nacimiento', value: props.profileForm.birthDate }
      : null,
    props.profileForm.nationality
      ? { label: 'Nacionalidad', value: props.profileForm.nationality }
      : null,
    props.profileForm.documentType
      ? { label: 'Tipo de documento', value: props.profileForm.documentType }
      : null,
    props.profileForm.documentNumber
      ? { label: 'Numero de documento', value: props.profileForm.documentNumber }
      : null,
    props.profileForm.documentExpiration
      ? { label: 'Vigencia del documento', value: props.profileForm.documentExpiration }
      : null,
    props.profileForm.identityValidationRequired
      ? {
          label: 'Validacion de identidad requerida',
          value: props.profileForm.identityValidationRequired,
        }
      : null,
    props.profileForm.documents
      ? { label: 'Documentos', value: props.profileForm.documents }
      : null,
    props.profileForm.profileState
      ? { label: 'Estado perfil', value: props.profileForm.profileState }
      : null,
  ].filter(Boolean),
)

const statusChips = computed(() =>
  [
    props.profileForm.profileState
      ? { value: props.profileForm.profileState, tone: 'status-chip-warning' }
      : null,
    props.currentStatus
      ? { value: props.currentStatus, tone: 'status-chip-neutral' }
      : null,
  ].filter(Boolean),
)

const administrativeSummary = computed(() =>
  [
    props.documentsValidity
      ? { label: `Documentos ${props.documentsValidity}% validados` }
      : null,
    props.profileForm.profileState
      ? { label: `Perfil ${props.profileForm.profileState}` }
      : null,
  ].filter(Boolean),
)

function updateProfileField(field, value) {
  emit('update-field', { form: 'profile', field, value })
}

function clearAirportTimer() {
  if (airportSearchTimer) {
    window.clearTimeout(airportSearchTimer)
    airportSearchTimer = null
  }
}

function closeAirportOptions() {
  airportOptionsOpen.value = false
}

function scheduleAirportSearch(query) {
  clearAirportTimer()

  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) {
    airportSuggestions.value = []
    airportLoading.value = false
    airportOptionsOpen.value = false
    return
  }

  airportLoading.value = true
  airportOptionsOpen.value = true

  airportSearchTimer = window.setTimeout(async () => {
    try {
      const result = await searchAirports(trimmedQuery, 6)
      airportSuggestions.value = Array.isArray(result?.items) ? result.items : []
      airportOptionsOpen.value = airportSuggestions.value.length > 0
    } catch {
      airportSuggestions.value = []
      airportOptionsOpen.value = false
    } finally {
      airportLoading.value = false
      airportSearchTimer = null
    }
  }, 220)
}

function handleBaseInput(event) {
  const value = event?.target?.value || ''
  updateProfileField('base', value)
  scheduleAirportSearch(value)
}

function selectBaseAirport(airport) {
  updateProfileField('base', airport?.code || airport?.iata || formatAirportOption(airport))
  airportSuggestions.value = []
  airportOptionsOpen.value = false
}

onBeforeUnmount(() => {
  clearAirportTimer()
})
</script>

<template>
  <section class="profile-page">
    <div class="page-head surface">
      <div class="hero-copy">
        <div class="title-row">
          <span class="icon-badge"><CrewUiIcon name="profile" :size="20" /></span>
          <div>
            <span class="eyebrow">Perfil de vuelo</span>
            <h3>Perfil operativo</h3>
          </div>
        </div>
        <p class="muted">
          Ajusta tu identidad profesional, base, idiomas, certificaciones y datos operativos para mantener prioridad de asignacion.
        </p>
      </div>
      <button class="primary-action action-button" type="button" @click="$emit('save')">
        <CrewUiIcon name="profile" :size="16" />
        Guardar perfil
      </button>
    </div>

    <section class="surface form-card">
      <div class="form-grid">
        <label class="airport-field">
          <span>Base</span>
          <input
            :value="profileForm.base"
            type="text"
            autocomplete="off"
            @focus="scheduleAirportSearch(profileForm.base)"
            @blur="window.setTimeout(closeAirportOptions, 120)"
            @input="handleBaseInput"
          />
          <div
            v-if="airportLoading || (airportOptionsOpen && airportSuggestions.length)"
            class="airport-options"
          >
            <span v-if="airportLoading">Buscando aeropuertos...</span>
            <button
              v-for="airport in airportSuggestions"
              v-else
              :key="`${airport.code}-${airport.iata}-${airport.name}`"
              type="button"
              @mousedown.prevent="selectBaseAirport(airport)"
            >
              {{ formatAirportOption(airport) }}
            </button>
          </div>
        </label>

        <label v-for="field in editableFields" :key="field.key">
          <span>{{ field.label }}</span>
          <input
            :value="field.value"
            :type="field.type"
            @input="updateProfileField(field.key, $event.target.value)"
          />
          <small v-if="field.error">{{ field.error }}</small>
        </label>

        <label
          v-for="field in readonlyFields"
          :key="field.label"
          class="readonly-field"
        >
          <span>{{ field.label }}</span>
          <div class="readonly-value">{{ field.value }}</div>
        </label>
      </div>
    </section>
  </section>
</template>

<style scoped>
.profile-page,
.form-grid,
.alerts-stack,
.detail-summary-row {
  display: grid;
  gap: 1.5rem;
}

.page-head,
.form-card {
  padding: 1.4rem;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.icon-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 16px;
  color: #0a8f5b;
  background: linear-gradient(180deg, rgba(10, 143, 91, 0.12), rgba(10, 143, 91, 0.04));
}

.page-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
}

.section-mini-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.section-mini-head h4 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.04em;
}

.status-chip,
.summary-pill,
.alert-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 700;
}

.status-chip {
  padding: 0.7rem 1.2rem;
  border: 1px solid rgba(177, 127, 15, 0.18);
  background: rgba(255, 248, 235, 0.95);
  color: #6e4b0b;
}

.status-chip-neutral {
  border-color: rgba(16, 22, 28, 0.1);
  background: rgba(246, 243, 238, 0.96);
  color: #2c241d;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.info-card,
.detail-block {
  border: 1px solid rgba(221, 201, 167, 0.78);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 253, 249, 0.98), rgba(255, 251, 244, 0.96));
}

.info-card {
  display: grid;
  gap: 0.35rem;
  padding: 1.45rem 1.55rem;
}

.info-card span,
.section-mini-head p {
  color: #7b6646;
}

.info-card strong,
.detail-block h4 {
  color: #241a13;
}

.info-card strong {
  font-size: 1.15rem;
  line-height: 1.2;
}

.info-card-wide {
  grid-column: 1 / -1;
}

.detail-block {
  display: grid;
  gap: 1.15rem;
  padding: 1.55rem;
}

.section-mini-head {
  align-items: end;
}

.section-mini-head p {
  margin: 0;
  max-width: 42rem;
}

.alerts-stack {
  grid-template-columns: repeat(auto-fit, minmax(220px, max-content));
  gap: 0.85rem;
}

.alert-pill {
  padding: 0.85rem 1.1rem;
  border: 1px solid rgba(233, 130, 119, 0.34);
  background: rgba(255, 240, 238, 0.92);
  color: #6d2a25;
}

.detail-summary-row {
  grid-template-columns: repeat(auto-fit, minmax(220px, max-content));
  gap: 0.85rem;
}

.summary-pill {
  padding: 0.85rem 1.05rem;
  border: 1px solid rgba(221, 201, 167, 0.92);
  background: rgba(255, 251, 245, 0.96);
  color: #5f4c35;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
  position: relative;
}

.readonly-field {
  align-content: start;
}

.readonly-value {
  min-height: 3.5rem;
  display: flex;
  align-items: center;
  padding: 0 1rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 18px;
  background: rgba(247, 249, 251, 0.9);
  color: #241a13;
  font-weight: 600;
}

.form-grid small {
  color: #b42318;
}

.action-button {
  gap: 0.45rem;
}

.airport-field {
  position: relative;
}

.airport-options {
  position: absolute;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  z-index: 20;
  display: grid;
  gap: 0.2rem;
  padding: 0.45rem;
  border: 1px solid rgba(16, 22, 28, 0.08);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 42px rgba(16, 22, 28, 0.12);
}

.airport-options span {
  padding: 0.85rem 1rem;
  color: #75685d;
  font-size: 0.94rem;
}

.airport-options button {
  border: 0;
  background: transparent;
  border-radius: 14px;
  padding: 0.85rem 1rem;
  text-align: left;
  font: inherit;
  color: #181312;
  cursor: pointer;
}

.airport-options button:hover {
  background: rgba(191, 150, 56, 0.08);
}

@media (max-width: 1080px) {
  .info-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .info-card-wide {
    grid-column: auto;
  }
}

@media (max-width: 760px) {
  .page-head,
  .detail-head,
  .section-mini-head {
    display: grid;
  }

  .title-row {
    align-items: flex-start;
  }

  .page-head,
  .detail-panel,
  .form-card {
    padding: 1.05rem;
  }

  .page-head > .action-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
