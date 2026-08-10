/*----------------------------------------------------------------------------------------------*/
// VISTA DE SECCION DE AERONAVES DEL PORTAL DE OPERADOR
/*----------------------------------------------------------------------------------------------*/

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { searchAirports } from '../../../lib/airportSearch'

const props = defineProps({
  aircraft: { type: Array, required: true },
  aircraftForm: { type: Object, required: true },
  imageForm: { type: Object, required: true },
  documentForm: { type: Object, required: true },
  providerName: { type: String, default: 'Proveedor' },
  statusLabels: { type: Object, required: true },
})

const emit = defineEmits([
  'update-aircraft-field',
  'update-image-field',
  'update-document-field',
  'create-aircraft',
  'upload-images',
  'upload-document',
])

const imageFields = [
  { key: 'main_file', nameKey: 'main_file_name', title: 'Imagen principal', hint: 'Portada visible en opciones sugeridas.' },
  { key: 'gallery_exterior_file', nameKey: 'gallery_exterior', title: 'Galeria exterior', hint: 'Muestra fuselaje y perfil del avion.' },
  { key: 'gallery_interior_file', nameKey: 'gallery_interior', title: 'Galeria interior', hint: 'Vista general del interior.' },
  { key: 'cabin_file', nameKey: 'cabin', title: 'Cabina', hint: 'Experiencia de cabina ejecutiva.' },
  { key: 'seats_file', nameKey: 'seats', title: 'Asientos', hint: 'Configuracion y comfort.' },
  { key: 'amenities_file', nameKey: 'amenities', title: 'Amenidades', hint: 'Pantallas, bar, WiFi o extras.' },
]

const baseAirportDisplay = ref('')
const baseAirportSuggestions = ref([])
const baseAirportLoading = ref(false)
const baseAirportOpen = ref(false)
let baseAirportTimer = null

function clearBaseAirportTimer() {
  if (baseAirportTimer && typeof window !== 'undefined') {
    window.clearTimeout(baseAirportTimer)
  }
  baseAirportTimer = null
}

function formatBaseAirportLabel(airport = {}) {
  const city = String(airport.city || airport.name || 'Aeropuerto').trim()
  const code = String(airport.code || airport.icao || airport.iata || '').trim()
  return code ? `${city} / ${code}` : city
}

async function scheduleBaseAirportSearch(query) {
  clearBaseAirportTimer()

  const trimmedQuery = String(query || '').trim()
  if (!trimmedQuery) {
    baseAirportSuggestions.value = []
    baseAirportLoading.value = false
    baseAirportOpen.value = false
    return
  }

  baseAirportLoading.value = true
  baseAirportOpen.value = true

  baseAirportTimer = window.setTimeout(async () => {
    try {
      const result = await searchAirports(trimmedQuery, 6)
      baseAirportSuggestions.value = Array.isArray(result?.items) ? result.items : []
      baseAirportOpen.value = baseAirportSuggestions.value.length > 0
    } catch {
      baseAirportSuggestions.value = []
      baseAirportOpen.value = false
    } finally {
      baseAirportLoading.value = false
      baseAirportTimer = null
    }
  }, 220)
}

function handleBaseAirportInput(event) {
  const value = event?.target?.value || ''
  baseAirportDisplay.value = value
  emit('update-aircraft-field', { field: 'base_airport', value })
  scheduleBaseAirportSearch(value)
}

function selectBaseAirport(airport) {
  const label = formatBaseAirportLabel(airport)
  const code = String(airport?.code || airport?.icao || airport?.iata || '').trim()

  baseAirportDisplay.value = label
  emit('update-aircraft-field', { field: 'base_airport', value: code || label })
  emit('update-aircraft-field', { field: 'base_airport_label', value: label })
  emit('update-aircraft-field', { field: 'base_airport_id', value: airport?.id || '' })

  baseAirportSuggestions.value = []
  baseAirportOpen.value = false
}

function closeBaseAirportOptions() {
  baseAirportOpen.value = false
}

function onImageSelected(field, event) {
  const file = event.target.files?.[0] || null
  emit('update-image-field', { field: field.key, value: file })
  emit('update-image-field', { field: field.nameKey, value: file?.name || '' })
}

watch(
  () => props.aircraftForm.base_airport,
  (nextValue) => {
    const normalized = String(nextValue || '').trim()
    if (!normalized) {
      baseAirportDisplay.value = ''
      return
    }

    if (!baseAirportOpen.value && normalized !== baseAirportDisplay.value) {
      baseAirportDisplay.value = normalized
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  clearBaseAirportTimer()
})
</script>

<template>
  <section class="aircraft-page">
    <div class="surface page-head">
      <div>
        <span class="eyebrow">Aeronaves del proveedor</span>
        <h3>Datos tecnicos, imagenes S3 y documentos para revision</h3>
        <p class="muted">
          {{ providerName }} puede publicar su aeronave, cargar material comercial visible al cliente y separar la capa documental para validacion.
        </p>
      </div>
    </div>

    <div class="flow-strip surface">
      <div class="flow-step done">
        <span>01</span>
        <strong>Datos tecnicos</strong>
      </div>
      <div class="flow-step">
        <span>02</span>
        <strong>Imagenes de aeronave</strong>
      </div>
      <div class="flow-step">
        <span>03</span>
        <strong>Documentos</strong>
      </div>
      <div class="flow-step">
        <span>04</span>
        <strong>Enviar a revision</strong>
      </div>
    </div>

    <div class="content-grid">
      <section class="surface form-card">
        <div class="section-head">
          <div>
            <h4>Nueva aeronave</h4>
            <p class="muted">Primero capturas datos tecnicos. Cuando guardas, el sistema activa trial por 15 dias.</p>
          </div>

          <button class="primary-action" type="button" @click="$emit('create-aircraft')">
            Guardar y activar trial
          </button>
        </div>

        <div class="form-grid">
          <label>
            <span>Modelo</span>
            <input :value="aircraftForm.model" type="text" @input="$emit('update-aircraft-field', { field: 'model', value: $event.target.value })" />
          </label>
          <label>
            <span>Fabricante</span>
            <input :value="aircraftForm.manufacturer" type="text" @input="$emit('update-aircraft-field', { field: 'manufacturer', value: $event.target.value })" />
          </label>
          <label>
            <span>Matricula</span>
            <input :value="aircraftForm.registration" type="text" @input="$emit('update-aircraft-field', { field: 'registration', value: $event.target.value })" />
          </label>
          <label>
            <span>Ano</span>
            <input :value="aircraftForm.year" type="number" min="1900" @input="$emit('update-aircraft-field', { field: 'year', value: $event.target.value })" />
          </label>
          <label>
            <span>Capacidad</span>
            <input :value="aircraftForm.capacity" type="number" min="1" @input="$emit('update-aircraft-field', { field: 'capacity', value: $event.target.value })" />
          </label>
          <label>
            <span>Rango KM</span>
            <input :value="aircraftForm.range_km" type="number" min="0" @input="$emit('update-aircraft-field', { field: 'range_km', value: $event.target.value })" />
          </label>
          <label class="airport-field">
            <span>Aeropuerto base</span>
            <input
              :value="baseAirportDisplay"
              type="text"
              autocomplete="off"
              placeholder="Toluca / MMTO"
              @focus="scheduleBaseAirportSearch(baseAirportDisplay)"
              @blur="window.setTimeout(closeBaseAirportOptions, 120)"
              @input="handleBaseAirportInput"
            />
            <div
              v-if="baseAirportLoading || (baseAirportOpen && baseAirportSuggestions.length)"
              class="airport-options"
            >
              <span v-if="baseAirportLoading">Buscando aeropuertos...</span>
              <button
                v-for="airport in baseAirportSuggestions"
                v-else
                :key="`${airport.code}-${airport.iata}-${airport.name}`"
                type="button"
                @mousedown.prevent="selectBaseAirport(airport)"
              >
                <strong>{{ airport.city || airport.name || 'Aeropuerto' }}</strong>
                <small>
                  {{ airport.code || airport.iata }}
                  <template v-if="airport.iata && airport.code"> · {{ airport.iata }}</template>
                </small>
              </button>
            </div>
          </label>
          <label>
            <span>Costo base por hora USD</span>
            <input :value="aircraftForm.hourly_rate" type="number" min="0" @input="$emit('update-aircraft-field', { field: 'hourly_rate', value: $event.target.value })" />
          </label>
        </div>
      </section>

      <section class="surface form-card">
        <div class="section-head">
          <div>
            <h4>Imagenes de aeronave</h4>
            <p class="muted">Estas imagenes seran visibles al cliente solo cuando la aeronave sea aprobada. Render orquesta el backend y S3 almacena el asset final.</p>
          </div>

          <button class="primary-action" type="button" @click="$emit('upload-images')">
            Cargar imagenes
          </button>
        </div>

        <div class="form-grid">
          <label class="field-full">
            <span>Aeronave</span>
            <select :value="imageForm.aircraft_id" @change="$emit('update-image-field', { field: 'aircraft_id', value: $event.target.value })">
              <option value="">Selecciona</option>
              <option v-for="item in aircraft" :key="item.id" :value="item.id">
                {{ item.registration }} - {{ item.model }}
              </option>
            </select>
          </label>

          <label v-for="field in imageFields" :key="field.key" class="image-field">
            <span>{{ field.title }}</span>
            <input type="file" accept="image/*" @change="onImageSelected(field, $event)" />
            <strong v-if="imageForm[field.nameKey]">{{ imageForm[field.nameKey] }}</strong>
            <small>{{ field.hint }}</small>
          </label>
        </div>

        <div class="client-visibility-note">
          <strong>Visible al cliente</strong>
          <p>Modelo, tipo de cabina, capacidad, fotos y amenidades.</p>
          <strong>No visible al cliente</strong>
          <p>Proveedor, matricula, documentos, costo interno, contacto y reglas comerciales.</p>
        </div>
      </section>
    </div>

    <section class="surface form-card">
      <div class="section-head">
        <div>
          <h4>Documentos de aeronave</h4>
          <p class="muted">Esta capa sirve para validacion/admin y no para la galeria comercial del cliente.</p>
        </div>

        <button class="primary-action" type="button" @click="$emit('upload-document')">
          Agregar documento
        </button>
      </div>

      <div class="form-grid">
        <label>
          <span>Aeronave</span>
          <select :value="documentForm.aircraft_id" @change="$emit('update-document-field', { field: 'aircraft_id', value: $event.target.value })">
            <option value="">Selecciona</option>
            <option v-for="item in aircraft" :key="item.id" :value="item.id">
              {{ item.registration }} - {{ item.model }}
            </option>
          </select>
        </label>
        <label>
          <span>Tipo</span>
          <select :value="documentForm.type" @change="$emit('update-document-field', { field: 'type', value: $event.target.value })">
            <option value="airworthiness">Aeronavegabilidad</option>
            <option value="insurance">Sticker de mantenimiento</option>
            <option value="maintenance">Mantenimiento</option>
            <option value="operator_certificate">Bitacora de vuelos</option>
          </select>
        </label>
        <label>
          <span>Archivo</span>
          <input :value="documentForm.file_name" type="text" @input="$emit('update-document-field', { field: 'file_name', value: $event.target.value })" />
        </label>
        <label>
          <span>Vence</span>
          <input :value="documentForm.expires_at" type="date" @input="$emit('update-document-field', { field: 'expires_at', value: $event.target.value })" />
        </label>
      </div>
    </section>

    <section class="fleet-grid">
      <article v-for="item in aircraft" :key="item.id" class="surface fleet-card">
        <div class="fleet-top">
          <div>
            <span class="badge">{{ item.registration }}</span>
            <h4>{{ item.model }}</h4>
            <p class="muted">{{ item.manufacturer }} · {{ item.capacity }} pax · {{ item.base_airport }}</p>
          </div>

          <div class="status-block">
            <strong>{{ statusLabels[item.status] || item.status }}</strong>
            <small>{{ item.approved ? 'Aprobada por admin' : 'Pendiente de aprobacion' }}</small>
          </div>
        </div>

        <div class="preview-ribbon">
          <img v-if="item.main_image" :src="item.main_image" :alt="item.model" class="preview-image" />
          <div class="preview-copy">
            <span>Cliente vera</span>
            <strong>{{ item.model }} · {{ item.category || 'Cabina ejecutiva' }}</strong>
            <p>{{ item.images?.length || 0 }} imagenes comerciales listas · {{ item.documents.length }} documentos internos</p>
          </div>
        </div>

        <div class="info-grid">
          <div>
            <span>Trial</span>
            <strong>{{ item.trial_starts_at?.slice(0, 10) }} al {{ item.trial_ends_at?.slice(0, 10) }}</strong>
          </div>
          <div>
            <span>Dias restantes</span>
            <strong>{{ item.trial_days_left }}</strong>
          </div>
          <div>
            <span>Documentos</span>
            <strong>{{ item.documents.length }} · {{ item.documents_valid ? 'Validos' : 'Incompletos' }}</strong>
          </div>
          <div>
            <span>Imagenes</span>
            <strong>{{ item.images?.length || 0 }} registradas</strong>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.aircraft-page,
.content-grid,
.form-grid,
.fleet-grid,
.info-grid {
  display: grid;
  gap: 1rem;
}

.page-head,
.form-card,
.fleet-card,
.flow-strip {
  padding: 1rem;
}

.content-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.flow-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid #ece3d1;
  border-radius: 20px;
  background: var(--surface-premium);
}

.flow-step {
  display: grid;
  gap: 0.3rem;
}

.flow-step span {
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.flow-step strong {
  font-size: 0.95rem;
}

.section-head,
.fleet-top,
.preview-ribbon {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.section-head h4,
.fleet-card h4,
.page-head h3 {
  margin: 0;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

.form-grid label,
.info-grid div,
.status-block,
.client-visibility-note {
  display: grid;
  gap: 0.35rem;
}

.airport-field {
  position: relative;
}

.field-full {
  grid-column: 1 / -1;
}

.airport-options {
  position: absolute;
  top: calc(100% + 0.45rem);
  left: 0;
  right: 0;
  z-index: 12;
  display: grid;
  gap: 0.25rem;
  padding: 0.45rem;
  border: 1px solid #d8d0c3;
  border-radius: 18px;
  background: #fffdfa;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}

.airport-options span {
  color: #6f6558;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.airport-options button {
  display: grid;
  gap: 0.12rem;
  width: 100%;
  padding: 0.8rem 0.9rem;
  border: 1px solid transparent;
  border-radius: 14px;
  background: #ffffff;
  color: #172b4d;
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.airport-options button:hover {
  border-color: #d6c3a3;
  background: #fbf6ee;
  transform: translateY(-1px);
}

.airport-options button strong {
  font-size: 0.95rem;
}

.airport-options button small {
  color: #6f6558;
}

.image-field {
  padding: 0.85rem;
  border: 1px solid #ece3d1;
  border-radius: 18px;
  background: var(--surface-premium);
}

.image-field strong {
  font-size: 0.85rem;
}

.image-field small,
.client-visibility-note p {
  color: #5d5d5d;
  line-height: 1.6;
  margin: 0;
}

.client-visibility-note {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #ece3d1;
  border-radius: 18px;
  background: var(--surface-premium);
}

.fleet-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.preview-ribbon {
  margin-top: 1rem;
  padding: 0.9rem;
  border: 1px solid #ece3d1;
  border-radius: 18px;
  background: var(--surface-premium);
}

.preview-image {
  width: 7rem;
  height: 5rem;
  object-fit: cover;
  border-radius: 14px;
}

.preview-copy {
  display: grid;
  gap: 0.3rem;
}

.preview-copy span,
.info-grid span,
.form-grid span {
  color: #70675c;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.preview-copy p {
  margin: 0;
  color: #5d5d5d;
}

.info-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 1rem;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .fleet-grid,
  .info-grid,
  .flow-strip {
    grid-template-columns: 1fr;
  }

  .preview-ribbon {
    display: grid;
  }
}
</style>
