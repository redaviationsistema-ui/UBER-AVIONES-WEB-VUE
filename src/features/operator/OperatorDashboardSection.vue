<script setup>
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  metrics: { type: Object, required: true },
  requests: { type: Array, required: true },
  fleet: { type: Array, required: true },
  membership: { type: Object, default: null },
  providerSummary: { type: Object, default: null },
  savingAircraftId: { type: [Number, null], default: null },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['go-section', 'save-aircraft-security'])

const kpis = computed(() => {
  const availableAircraft = props.fleet.filter((item) => item.status === 'active').length
  const activeFlights = props.requests.filter((_, index) => index < 2).length

  return [
    { label: 'Solicitudes nuevas', value: props.metrics.solicitudes_pendientes ?? props.requests.length },
    { label: 'Vuelos activos', value: activeFlights || 2 },
    { label: 'Aeronaves disponibles', value: availableAircraft || props.metrics.aeronaves || 0 },
    { label: 'Sobrecargos disponibles', value: props.metrics.sobrecargos_disponibles || 6 },
    { label: 'Incidencias activas', value: props.metrics.incidencias_activas || 2 },
    { label: 'Tiempo promedio', value: props.metrics.tiempo_respuesta || '11 min' },
  ]
})

const operations = computed(() =>
  props.requests.map((request, index) => ({
    id: request.id,
    client: request.client || 'Cliente Sky Group',
    route: `${request.origin} -> ${request.destination}`,
    date: request.departure_datetime,
    aircraft: props.fleet[index]?.model || (index === 2 ? 'Citation Latitude' : 'Learjet 45XR'),
    crew: index === 0 ? 'Sobrecargo Ana Lira' : index === 1 ? 'Sobrecargo Diego Solis' : 'Sobrecargo Carla Ruiz',
    status: index === 0 ? 'Asignado' : index === 1 ? 'Briefing' : 'Pendiente',
    priority: index === 0 ? 'Alta' : index === 1 ? 'VIP' : 'Media',
    vipLevel: index === 0 ? 'Black' : index === 1 ? 'Executive' : 'Corporate',
    package: index === 0 ? 'Jet Card' : index === 1 ? 'Corporate Elite' : 'Occasional Premium',
    sla: index === 0 ? '12 min' : index === 1 ? '18 min' : '22 min',
    passengers: request.passengers,
  })),
)

const editorialSteps = computed(() => [
  {
    title: 'Entrada de solicitud',
    description: 'Cada servicio llega con ruta, horario, pasajeros, SLA y nivel de prioridad para su revision.',
    meta: 'Recepcion',
  },
  {
    title: 'Validacion operativa',
    description: 'El operador confirma aeronave, tripulacion, briefing, catering y restricciones antes de liberar el vuelo.',
    meta: 'Coordinacion',
  },
  {
    title: 'Seguimiento y cierre',
    description: 'La ejecucion se monitorea hasta el despegue, el cierre del servicio y el registro final de incidencias.',
    meta: 'Control',
  },
])

const alerts = computed(() => [
  {
    title: 'Vuelo pendiente por asignar',
    detail: `La solicitud #${props.requests[0]?.id || '8841'} aun espera la confirmacion final del sobrecargo.`,
  },
  {
    title: 'Cambio de itinerario',
    detail: `La ruta ${props.requests[1]?.origin || 'CUN'} -> ${props.requests[1]?.destination || 'MIA'} presenta un ajuste por slot internacional.`,
  },
  {
    title: 'Retraso en preparacion',
    detail: 'Una salida de la tarde muestra desviacion en el briefing y en el ETA operativo.',
  },
  {
    title: 'Documento pendiente',
    detail: 'Aun falta una validacion documental antes de liberar una operacion VIP.',
  },
])

const queueColumns = computed(() => [
  {
    title: 'Pendientes',
    items: operations.value.slice(0, 1),
  },
  {
    title: 'Validando',
    items: operations.value.slice(1, 2),
  },
  {
    title: 'Aprobadas',
    items: operations.value.slice(2, 3),
  },
  {
    title: 'Rechazadas',
    items: [],
  },
])

const fleetSecuritySummary = computed(() => {
  const averageScore =
    props.fleet.length > 0
      ? Math.round(props.fleet.reduce((acc, item) => acc + Number(item.security_score || 0), 0) / props.fleet.length)
      : 0

  const aircraftAtRisk = props.fleet.filter((item) => item.security_filter !== 'Aprobado').length
  const fboReady = props.fleet.filter((item) => item.client_fbo && item.dispatch_center).length

  return [
    { label: 'Filtro seguridad promedio', value: averageScore ? `${averageScore}/100` : 'Sin datos', detail: 'Lectura rapida del nivel de liberacion de la flota.' },
    { label: 'Aeronaves con revision', value: String(aircraftAtRisk), detail: 'Equipos que requieren seguimiento de seguridad o documentos.' },
    { label: 'FBO y despacho mapeados', value: String(fboReady), detail: 'Aeronaves con FBO cliente y capa de trafico definidos.' },
    {
      label: 'Membresia activa',
      value: props.membership?.plan_name || 'Sin plan visible',
      detail: props.membership?.max_aircraft ? `Capacidad contratada para ${props.membership.max_aircraft} aeronaves.` : 'Sin limite publicado.',
    },
  ]
})

const fleetComplianceCards = computed(() =>
  props.fleet.map((item) => ({
    id: item.id,
    model: item.model,
    registration: item.registration,
    safetyFilter: item.security_filter || 'Revision manual',
    safetyScore: item.security_score || 0,
    airworthiness: item.airworthiness_status || 'Pendiente',
    maintenance: item.last_maintenance_at || 'Sin captura',
    engineRun: item.engine_run_at || 'Sin captura',
    captainTraining: item.captain_training_at || 'Sin captura',
    lodging: item.lodging_location || item.base_airport || 'Sin definir',
    airport: item.base_airport || 'N/D',
    city: item.city_label || 'Sin base',
    fbo: item.client_fbo || 'Sin FBO',
    dispatch: item.dispatch_center || 'Sin despacho',
    dispatchNote: item.dispatch_note || 'Pendiente de coordinacion operativa.',
    securityNotes: item.security_notes || '',
    status: item.status || 'active',
    membershipPlan: item.provider_membership?.plan_name || props.membership?.plan_name || 'Sin plan',
    membershipCost:
      item.provider_membership?.monthly_cost_per_aircraft > 0
        ? `$${item.provider_membership.monthly_cost_per_aircraft} / aeronave`
        : 'Costo no definido',
    overPlan: Boolean(item.provider_membership?.over_plan),
    maxAircraft: item.provider_membership?.max_aircraft || props.membership?.max_aircraft || 0,
    documents: Array.isArray(item.documents) ? item.documents.length : 0,
  })),
)

const membershipHighlights = computed(() => {
  const monthlyBase = Number(props.membership?.price_monthly || props.membership?.price_yearly || 0)
  const aircraftCount = Math.max(props.fleet.length, 1)
  const costPerAircraft = monthlyBase > 0 ? Math.round((monthlyBase / aircraftCount) * 100) / 100 : 0

  return [
    {
      title: 'Membresia del proveedor',
      value: props.membership?.plan_name || 'Sin plan visible',
      detail: props.providerSummary?.commercial_name || props.providerSummary?.company_name || 'Proveedor en revision',
    },
    {
      title: 'Costo mensual por aeronave',
      value: costPerAircraft ? `$${costPerAircraft}` : 'A medida',
      detail: props.membership?.max_aircraft ? `Limite contratado: ${props.membership.max_aircraft} aeronaves.` : 'Sin techo configurado.',
    },
    {
      title: 'Cobertura operativa',
      value: props.membership?.has_priority ? 'Prioridad activa' : 'Prioridad base',
      detail: props.membership?.has_reports ? 'Incluye reportes ejecutivos.' : 'Sin reportes premium.',
    },
  ]
})

const securityDrawerOpen = ref(false)
const editingAircraftId = ref(null)
const securityForm = reactive({
  security_filter: 'Aprobado',
  security_score: 94,
  airworthiness_status: 'Lista para despacho',
  last_maintenance_at: '',
  engine_run_at: '',
  captain_training_at: '',
  lodging_location: '',
  client_fbo: '',
  dispatch_center: '',
  dispatch_notes: '',
  security_notes: '',
})

function openSecurityEditor(aircraft) {
  editingAircraftId.value = aircraft.id
  securityForm.security_filter = aircraft.safetyFilter || 'Aprobado'
  securityForm.security_score = aircraft.safetyScore || 0
  securityForm.airworthiness_status = aircraft.airworthiness || ''
  securityForm.last_maintenance_at = aircraft.maintenance === 'Sin captura' ? '' : aircraft.maintenance
  securityForm.engine_run_at = aircraft.engineRun === 'Sin captura' ? '' : aircraft.engineRun
  securityForm.captain_training_at = aircraft.captainTraining === 'Sin captura' ? '' : aircraft.captainTraining
  securityForm.lodging_location = aircraft.lodging === 'Sin definir' ? '' : aircraft.lodging
  securityForm.client_fbo = aircraft.fbo === 'Sin FBO' ? '' : aircraft.fbo
  securityForm.dispatch_center = aircraft.dispatch === 'Sin despacho' ? '' : aircraft.dispatch
  securityForm.dispatch_notes = aircraft.dispatchNote || ''
  securityForm.security_notes = aircraft.securityNotes || ''
  securityDrawerOpen.value = true
}

function closeSecurityEditor() {
  securityDrawerOpen.value = false
  editingAircraftId.value = null
}

function submitSecurityEditor() {
  emit('save-aircraft-security', {
    aircraftId: editingAircraftId.value,
    form: { ...securityForm },
  })
  closeSecurityEditor()
}
</script>

<template>
  <div class="operator-dashboard-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Control operacional</p>
        <h1>Coordina solicitudes, vuelos y tripulacion desde una sola vista</h1>
        <p class="hero-subtitle">
          El portal del operador concentra entrada de solicitudes, asignacion de recursos,
          seguimiento y alertas en un panel claro para tomar decisiones rapidas.
        </p>

        <div class="hero-actions">
          <button class="hero-action" type="button" @click="$emit('go-section', 'solicitudes')">
            Validar solicitudes
          </button>
          <button class="hero-action secondary-hero-action" type="button" @click="$emit('go-section', 'operaciones')">
            Abrir operacion
          </button>
        </div>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in kpis" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </article>
    </section>

    <section class="editorial-section">
      <div class="editorial-heading">
        <h2>Flujo del operador</h2>
        <p>
          Aqui se transforma cada solicitud en una operacion lista para ejecutarse, con control
          sobre recursos, tiempos de respuesta y riesgo operativo.
        </p>
      </div>

      <div class="step-editorial refined-steps">
        <article v-for="(step, index) in editorialSteps" :key="step.title" class="step-row">
          <div class="step-index" aria-hidden="true">0{{ index + 1 }}</div>
          <div class="step-copy">
            <span class="step-meta">{{ step.meta }}</span>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="security-section">
      <div class="section-heading">
        <h2>Seguridad de aeronaves</h2>
        <p>
          Esta capa cruza filtro de seguridad, aeronavegabilidad, mantenimiento, corrida de motores,
          entrenamiento de capitanes, FBO cliente, despacho y costo de membresia por aeronave.
        </p>
      </div>

      <div class="security-strip">
        <article v-for="item in fleetSecuritySummary" :key="item.label" class="signal-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <p>{{ item.detail }}</p>
        </article>
      </div>

      <div class="membership-grid">
        <article v-for="item in membershipHighlights" :key="item.title" class="membership-card">
          <span class="mode-label">{{ item.title }}</span>
          <h3>{{ item.value }}</h3>
          <p>{{ item.detail }}</p>
        </article>
      </div>

      <div class="security-cards-grid">
        <article v-for="aircraft in fleetComplianceCards" :key="aircraft.id" class="security-card">
          <div class="security-card-top">
            <div>
              <span class="mode-label">{{ aircraft.registration }}</span>
              <h3>{{ aircraft.model }}</h3>
              <p>{{ aircraft.city }} · {{ aircraft.airport }} · {{ aircraft.lodging }}</p>
            </div>
            <div class="security-score" :class="{ warning: aircraft.safetyFilter !== 'Aprobado' }">
              <strong>{{ aircraft.safetyScore }}</strong>
              <span>{{ aircraft.safetyFilter }}</span>
            </div>
          </div>

          <div class="security-metrics">
            <div>
              <span>Aeronavegabilidad</span>
              <strong>{{ aircraft.airworthiness }}</strong>
            </div>
            <div>
              <span>Ultimo mantenimiento</span>
              <strong>{{ aircraft.maintenance }}</strong>
            </div>
            <div>
              <span>Corrida de motores</span>
              <strong>{{ aircraft.engineRun }}</strong>
            </div>
            <div>
              <span>Entrenamiento capitanes</span>
              <strong>{{ aircraft.captainTraining }}</strong>
            </div>
          </div>

          <div class="ops-ribbon">
            <div>
              <span>FBO cliente</span>
              <strong>{{ aircraft.fbo }}</strong>
            </div>
            <div>
              <span>Despacho / trafico</span>
              <strong>{{ aircraft.dispatch }}</strong>
            </div>
            <div>
              <span>Documentos</span>
              <strong>{{ aircraft.documents }} registros</strong>
            </div>
          </div>

          <div class="membership-footer">
            <div>
              <span>Membresia por avion</span>
              <strong>{{ aircraft.membershipPlan }} · {{ aircraft.membershipCost }}</strong>
            </div>
            <span class="table-pill priority-pill" :class="{ 'warning-pill': aircraft.overPlan }">
              {{ aircraft.overPlan ? `Excede limite (${aircraft.maxAircraft})` : 'Dentro de plan' }}
            </span>
          </div>

          <p class="dispatch-note">{{ aircraft.dispatchNote }}</p>

          <div class="card-actions">
            <button class="hero-action secondary-hero-action compact-action" type="button" @click="openSecurityEditor(aircraft)">
              Editar seguridad
            </button>
          </div>
        </article>
      </div>
    </section>

    <section class="operations-section">
      <div class="section-heading">
        <h2>Operaciones en tiempo real</h2>
        <p>
          {{
            loading
              ? 'Sincronizando el tablero operativo...'
              : `${operations.length} operaciones visibles dentro del seguimiento operativo de hoy.`
          }}
        </p>
      </div>

      <div class="operations-layout">
        <div class="operations-table-card">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Ruta</th>
                <th>Fecha</th>
                <th>Aeronave</th>
                <th>Sobrecargo</th>
                <th>Estado</th>
                <th>Prioridad</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="operation in operations" :key="operation.id">
                <td>{{ operation.client }}</td>
                <td>{{ operation.route }}</td>
                <td>{{ operation.date }}</td>
                <td>{{ operation.aircraft }}</td>
                <td>{{ operation.crew }}</td>
                <td><span class="table-pill">{{ operation.status }}</span></td>
                <td><span class="table-pill priority-pill">{{ operation.priority }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside class="alerts-card">
          <span class="mode-label">Alertas</span>
          <article v-for="alert in alerts" :key="alert.title" class="alert-item">
            <strong>{{ alert.title }}</strong>
            <p>{{ alert.detail }}</p>
          </article>
        </aside>
      </div>
    </section>

    <section class="modes-section">
      <div class="section-heading">
        <h2>Cola de solicitudes</h2>
        <p>
          Visualiza de inmediato que solicitudes estan por revisar, cuales siguen en validacion y
          cuales ya quedaron listas para la operacion.
        </p>
      </div>

      <div class="modes-grid refined-modes-grid">
        <article v-for="column in queueColumns" :key="column.title" class="mode-card">
          <div class="mode-copy">
            <span class="mode-label">{{ column.title }}</span>
            <h3>{{ column.items.length ? `${column.items.length} solicitudes` : 'Sin registros' }}</h3>

            <template v-if="column.items.length">
              <p v-for="item in column.items" :key="item.id">
                #{{ item.id }} - {{ item.route }} - {{ item.passengers }} pax - {{ item.package }} -
                {{ item.vipLevel }} - SLA {{ item.sla }}
              </p>
            </template>

            <p v-else>No hay solicitudes en esta etapa del flujo.</p>
          </div>
        </article>
      </div>
    </section>

    <transition name="fade">
      <div v-if="securityDrawerOpen" class="overlay" @click.self="closeSecurityEditor">
        <aside class="drawer-panel">
          <div class="overlay-head">
            <div>
              <span class="mode-label">Seguridad operativa</span>
              <h3>Actualizar aeronave</h3>
              <p>Guarda mantenimiento, corrida de motores, entrenamiento, FBO, despacho y notas operativas.</p>
            </div>
            <button class="hero-action secondary-hero-action compact-action" type="button" @click="closeSecurityEditor">
              Cerrar
            </button>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>Filtro de seguridad</span>
              <select v-model="securityForm.security_filter">
                <option value="Aprobado">Aprobado</option>
                <option value="Riesgo moderado">Riesgo moderado</option>
                <option value="Restringido">Restringido</option>
              </select>
            </label>

            <label class="field">
              <span>Score de seguridad</span>
              <input v-model="securityForm.security_score" type="number" min="0" max="100" />
            </label>

            <label class="field field-full">
              <span>Aeronavegabilidad</span>
              <input v-model="securityForm.airworthiness_status" type="text" placeholder="Lista para despacho" />
            </label>

            <label class="field">
              <span>Ultimo mantenimiento</span>
              <input v-model="securityForm.last_maintenance_at" type="date" />
            </label>

            <label class="field">
              <span>Corrida de motores</span>
              <input v-model="securityForm.engine_run_at" type="date" />
            </label>

            <label class="field">
              <span>Entrenamiento capitanes</span>
              <input v-model="securityForm.captain_training_at" type="date" />
            </label>

            <label class="field">
              <span>Donde esta alojado</span>
              <input v-model="securityForm.lodging_location" type="text" placeholder="Hangar ejecutivo A1" />
            </label>

            <label class="field">
              <span>FBO cliente</span>
              <input v-model="securityForm.client_fbo" type="text" placeholder="ICC, SAE, OMA Executive..." />
            </label>

            <label class="field">
              <span>Despacho / trafico</span>
              <input v-model="securityForm.dispatch_center" type="text" placeholder="Despacho central" />
            </label>

            <label class="field field-full">
              <span>Notas de despacho</span>
              <textarea v-model="securityForm.dispatch_notes" rows="3" placeholder="Recepcion, capa de trafico y coordinacion FBO."></textarea>
            </label>

            <label class="field field-full">
              <span>Notas de seguridad</span>
              <textarea v-model="securityForm.security_notes" rows="4" placeholder="Observaciones de aeronavegabilidad, mantenimiento o liberacion."></textarea>
            </label>
          </div>

          <div class="drawer-actions">
            <button class="hero-action secondary-hero-action compact-action" type="button" @click="closeSecurityEditor">
              Cancelar
            </button>
            <button class="hero-action compact-action" type="button" :disabled="props.savingAircraftId === editingAircraftId" @click="submitSecurityEditor">
              {{ props.savingAircraftId === editingAircraftId ? 'Guardando...' : 'Guardar en BD' }}
            </button>
          </div>
        </aside>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.operator-dashboard-page {
  min-height: 100vh;
  background: #ffffff;
  color: #111111;
}

.dashboard-hero,
.editorial-section,
.security-section,
.operations-section,
.modes-section {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  display: grid;
  gap: 2rem;
  min-height: 60vh;
  padding-top: 1rem;
  background:
    radial-gradient(circle at top right, rgba(201, 164, 90, 0.12), transparent 18%),
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.hero-center {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1rem;
  text-align: center;
}

.dark-eyebrow {
  color: #8c6a1f;
}

.hero-center h1,
.editorial-heading h2,
.section-heading h2,
.mode-copy h3,
.membership-card h3,
.security-card h3 {
  margin: 0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 15ch;
  font-size: clamp(2.8rem, 7vw, 4.4rem);
  line-height: 0.96;
}

.hero-subtitle,
.editorial-heading p,
.section-heading p,
.step-copy p,
.mode-copy p,
.alert-item p,
.membership-card p,
.dispatch-note,
.security-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.hero-subtitle {
  max-width: 68ch;
  margin: 0;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.hero-action {
  min-height: 3.4rem;
  border: 0;
  border-radius: 14px;
  padding: 0 1.25rem;
  color: #ffffff;
  background: #000000;
  font-weight: 800;
}

.secondary-hero-action {
  color: #111111;
  background: #ece7dc;
}

.status-strip,
.security-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 1rem;
}

.status-strip {
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.membership-card,
.security-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem 1.05rem;
  border: 1px solid #ebebeb;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.05);
}

.signal-card span,
.workstream-label {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.signal-card strong {
  font-size: 1rem;
}

.editorial-section,
.security-section,
.operations-section,
.modes-section {
  display: grid;
  gap: 1.6rem;
}

.editorial-heading,
.section-heading {
  max-width: 860px;
}

.editorial-heading h2,
.section-heading h2 {
  font-size: clamp(2rem, 4vw, 3rem);
  line-height: 1.02;
}

.step-editorial {
  display: grid;
  gap: 1rem;
}

.refined-steps {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-row {
  display: grid;
  gap: 1rem;
  padding: 1.15rem;
  border: 1px solid #ebebeb;
  border-radius: 20px;
  background: #fafafa;
}

.step-index {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 16px;
  color: #111111;
  background: #f0f0f0;
  font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.step-meta {
  display: inline-block;
  margin-bottom: 0.45rem;
  color: #8c6a1f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.step-copy strong {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 1.15rem;
}

.membership-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.security-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.membership-card,
.security-card {
  background:
    linear-gradient(180deg, #ffffff 0%, #faf8f2 100%);
}

.security-card-top,
.membership-footer,
.ops-ribbon {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
}

.security-score {
  display: grid;
  place-items: center;
  min-width: 5.5rem;
  padding: 0.85rem;
  border-radius: 20px;
  background: #e5f1ea;
  color: #0f7b53;
}

.security-score.warning {
  background: #f8e5d7;
  color: #a34b19;
}

.security-score strong {
  font-size: 1.5rem;
}

.security-score span,
.security-metrics span,
.ops-ribbon span,
.membership-footer span {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.security-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem;
}

.security-metrics div,
.ops-ribbon div,
.membership-footer div {
  display: grid;
  gap: 0.25rem;
}

.ops-ribbon {
  padding: 0.9rem 0;
  border-top: 1px solid #ece6d9;
  border-bottom: 1px solid #ece6d9;
}

.dispatch-note {
  margin: 0;
}

.card-actions,
.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.compact-action {
  min-height: 2.9rem;
  padding: 0 1rem;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(6px);
}

.drawer-panel {
  width: min(100%, 640px);
  min-height: 100vh;
  padding: 1.35rem;
  border-left: 1px solid #ebebeb;
  background: #ffffff;
  box-shadow: 0 22px 52px rgba(18, 26, 33, 0.16);
}

.overlay-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field span {
  color: #666666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 3rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid #d8dedc;
  border-radius: 16px;
  background: #fbfcfb;
  color: #111111;
  font: inherit;
}

.field textarea {
  min-height: 7rem;
  resize: vertical;
}

.field-full {
  grid-column: 1 / -1;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.operations-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.65fr);
  gap: 1rem;
}

.operations-table-card,
.alerts-card {
  border: 1px solid #ebebeb;
  border-radius: 20px;
  background: #ffffff;
}

.operations-table-card {
  overflow-x: auto;
}

table {
  width: 100%;
  min-width: 860px;
  border-collapse: collapse;
}

th,
td {
  padding: 0.95rem 0.7rem;
  border-top: 1px solid #ebebeb;
  text-align: left;
}

thead th {
  border-top: 0;
  color: #8c6a1f;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.table-pill {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #111111;
  background: #f0f0f0;
  font-size: 0.76rem;
  font-weight: 800;
}

.priority-pill {
  color: #8c6a1f;
  background: #f3ead2;
}

.warning-pill {
  color: #a34b19;
  background: #f8e5d7;
}

.alerts-card {
  display: grid;
  gap: 0.9rem;
  align-content: start;
  padding: 1rem;
  background: #faf8f3;
}

.alert-item {
  display: grid;
  gap: 0.35rem;
  padding: 0.9rem 0;
  border-top: 1px solid #e7decb;
}

.alert-item:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.alert-item strong {
  font-size: 1rem;
}

.modes-grid {
  display: grid;
  gap: 1rem;
}

.refined-modes-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.mode-card {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 18px;
  background: #f5f5f5;
}

.mode-copy {
  display: grid;
  gap: 0.5rem;
}

.mode-label {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.7rem;
  border-radius: 999px;
  color: #8c6a1f;
  background: #f3ead2;
  font-size: 0.76rem;
  font-weight: 800;
}

.mode-copy h3 {
  font-size: 1.2rem;
}

@media (max-width: 1180px) {
  .status-strip,
  .security-strip,
  .membership-grid,
  .refined-steps,
  .refined-modes-grid,
  .operations-layout,
  .security-cards-grid,
  .security-metrics,
  .form-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .hero-center {
    justify-items: stretch;
    text-align: left;
  }

  .hero-center h1 {
    max-width: none;
  }

  .hero-actions {
    display: grid;
  }

  .hero-action {
    width: 100%;
  }

  .security-card-top,
  .membership-footer,
  .ops-ribbon,
  .overlay-head,
  .card-actions,
  .drawer-actions {
    display: grid;
  }

  .drawer-panel {
    width: 100%;
  }
}
</style>
