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

<style scoped src="./OperatorDashboardSection.css"></style>
