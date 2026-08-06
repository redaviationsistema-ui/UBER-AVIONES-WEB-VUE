<script setup>
import { computed, ref } from 'vue'
import FlightSearchHero from '../FlightSearchHero.vue'
import {
  formatOfficialDisplayTime,
  getOfficialBillableHours,
  getOfficialFinalBillableHours,
  getOfficialPricing,
  getOfficialPricingNumber,
  getOfficialTotalAmount,
} from '../officialQuotePricing'

const props = defineProps({
  activeItinerarySummary: { type: Object, default: () => ({}) },
  activeResultFilter: { type: String, required: true },
  aircraftBackendBillableHoursLabel: { type: Function, required: true },
  aircraftBillingNote: { type: Function, required: true },
  aircraftCapacityLabel: { type: Function, required: true },
  aircraftClassLabel: { type: Function, required: true },
  aircraftSidebarFilters: { type: Object, required: true },
  aircraftSidebarPassengerBounds: { type: Object, required: true },
  aircraftSidebarPriceBounds: { type: Object, required: true },
  aircraftSidebarServiceOptions: { type: Array, required: true },
  aircraftSidebarSpeedBounds: { type: Object, required: true },
  aircraftSidebarTypeOptions: { type: Array, required: true },
  aircraftIncludes: { type: Function, required: true },
  aircraftPriceCopy: { type: Function, required: true },
  aircraftSpeedLine: { type: Function, required: true },
  aircraftVisualStyle: { type: Function, required: true },
  commercialAccessActionDisabled: { type: Boolean, required: true },
  commercialAccessCtaLabel: { type: String, required: true },
  commercialTrialNotice: { type: Object, required: true },
  featuredAircraft: { type: Object, default: null },
  isResultsSection: { type: Boolean, required: true },
  itineraryHeadline: { type: Function, required: true },
  itinerarySummary: { type: Object, default: () => ({}) },
  itineraryDateLine: { type: Function, required: true },
  reservationActionLabel: { type: Function, required: true },
  reservationLoadingState: { type: Object, required: true },
  reservingAircraftId: { type: String, default: '' },
  resultFilterOptions: { type: Array, required: true },
  searchForm: { type: Object, required: true },
  searching: { type: Boolean, required: true },
  secondaryAircraftOptions: { type: Array, required: true },
  serverSearchError: { type: String, default: '' },
  shouldShowCommercialAccessCta: { type: Boolean, required: true },
  tripType: { type: String, required: true },
})

defineEmits([
  'add-leg',
  'clear-aircraft-sidebar-filters',
  'contact-concierge',
  'go-commercial-access-payment',
  'modify-search',
  'remove-leg',
  'request-reservation',
  'retry-search',
  'select-form-airport',
  'select-leg-airport',
  'submit-search',
  'update:active-result-filter',
  'update-aircraft-sidebar-filter',
  'update-leg-field',
  'update-form-field',
  'update-trip-type',
])

function resultRankLabel(index = 0) {
  if (index === 0) return 'Seleccion curada'
  if (index === 1) return 'Alternativa agil'
  if (index === 2) return 'Balance ejecutivo'
  return ''
}

function aircraftFactChips(aircraft, itinerary, helpers) {
  const baseCode =
    aircraft?.aircraft_base_airport?.icao ||
    aircraft?.aircraft_base_airport?.iata ||
    aircraft?.source_origin

  return [
    helpers.aircraftClassLabel(aircraft),
    helpers.aircraftCapacityLabel(aircraft),
    helpers.aircraftSpeedLine(aircraft, itinerary),
    aircraft?.based_at_origin || aircraft?.base_airport_match
      ? 'Base en origen'
      : aircraft?.requires_repositioning && baseCode
        ? `Reposicionamiento desde ${baseCode}`
        : '',
  ].filter(Boolean)
}

function aircraftIsAvailable(aircraft) {
  return aircraft?.is_available !== false
}

function repositioningBaseLabel(aircraft = {}) {
  return (
    aircraft?.aircraft_base_airport?.city ||
    aircraft?.base_airport_city ||
    aircraft?.aircraft_base_airport?.name ||
    aircraft?.aircraft_base_airport?.icao ||
    aircraft?.aircraft_base_airport?.iata ||
    aircraft?.source_origin ||
    ''
  )
}

function repositioningRouteLabel(aircraft = {}) {
  const repositioning = aircraft?.repositioning || {}
  const origin = repositioning.origin_icao || repositioning.origin_iata || aircraft?.source_origin || ''
  const destination =
    repositioning.destination_icao ||
    repositioning.destination_iata ||
    aircraft?.itinerary_origin ||
    props.searchForm.origin ||
    ''

  if (!origin || !destination) return ''

  return `${origin} -> ${destination}`
}

function repositioningMetaLabel(aircraft = {}) {
  const repositioning = aircraft?.repositioning || {}
  const distanceNm = Number(
    repositioning.distance_nm || aircraft?.repositioning_distance_nm || 0,
  )
  const hours = Number(repositioning.flight_hours || aircraft?.repositioning_hours || 0)
  const minutes = Math.max(0, Math.round(hours * 60))
  const parts = []

  if (distanceNm > 0) parts.push(`${Math.round(distanceNm)} NM`)
  if (minutes > 0) parts.push(`${minutes} min`)

  return parts.join(' · ')
}

function selectedAirportLabel(value, fallback = 'Aeropuerto por definir') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

const trustPills = [
  'Sin comisiones ocultas',
  'Atencion 24/7',
  'Seguridad y privacidad',
  'Soporte personalizado',
]

const serviceBenefits = [
  {
    title: 'Precios transparentes',
    copy: 'Sin cargos ocultos ni comisiones inesperadas.',
  },
  {
    title: 'Seguridad garantizada',
    copy: 'Operadores certificados y aeronaves verificadas.',
  },
  {
    title: 'Cancelacion flexible',
    copy: 'Opciones flexibles segun politicas de cada operador.',
  },
  {
    title: 'Atencion 24/7',
    copy: 'Tu concierge siempre disponible para ayudarte.',
  },
]

const summaryHeadline = computed(() => props.itineraryHeadline(props.activeItinerarySummary))
const summaryDateLine = computed(() => props.itineraryDateLine(props.activeItinerarySummary))
const visibleAircraftCount = computed(
  () => props.secondaryAircraftOptions.length + (props.featuredAircraft ? 1 : 0),
)
const skeletonCards = Array.from({ length: 5 }, (_, index) => index)
const showSearchSkeletons = computed(() => props.searching)
const showSearchEmptyState = computed(
  () => !props.searching && !props.serverSearchError && visibleAircraftCount.value === 0,
)
const shouldHighlightCommercialAccess = computed(
  () => props.shouldShowCommercialAccessCta || ['warn', 'danger'].includes(props.commercialTrialNotice.tone),
)
const trustBarCopy = computed(() =>
  shouldHighlightCommercialAccess.value
    ? props.commercialTrialNotice.message
    : 'Tu cuenta ya puede cotizar, reservar, firmar contrato y pagar vuelos.',
)
const resultsCountCopy = computed(() =>
  props.searching
    ? 'Buscando aeronaves disponibles en el origen y en aeropuertos cercanos...'
    : `${visibleAircraftCount.value} opciones disponibles`,
)

function formatWholeCurrency(value = 0) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)
}

function rangeProgressStart(minValue = 0, maxValue = 0, currentMin = 0) {
  const span = Math.max(Number(maxValue || 0) - Number(minValue || 0), 1)
  const start = ((Number(currentMin || 0) - Number(minValue || 0)) / span) * 100
  return Math.min(Math.max(start, 0), 100)
}

function rangeProgressEnd(minValue = 0, maxValue = 0, currentMax = 0) {
  const span = Math.max(Number(maxValue || 0) - Number(minValue || 0), 1)
  const end = ((Number(currentMax || maxValue || 0) - Number(minValue || 0)) / span) * 100
  return Math.min(Math.max(end, 0), 100)
}

const priceSliderStyle = computed(() => {
  const bounds = props.aircraftSidebarPriceBounds || {}
  const start = rangeProgressStart(
    bounds.min,
    bounds.max,
    props.aircraftSidebarFilters.priceMin || bounds.min,
    props.aircraftSidebarFilters.priceMax || bounds.max,
  )
  const end = rangeProgressEnd(
    bounds.min,
    bounds.max,
    props.aircraftSidebarFilters.priceMax || bounds.max,
  )

  return {
    left: `${start}%`,
    right: `${Math.max(0, 100 - end)}%`,
  }
})

const passengerSliderStyle = computed(() => {
  const bounds = props.aircraftSidebarPassengerBounds || {}
  const end = rangeProgressEnd(
    bounds.min,
    bounds.max,
    props.aircraftSidebarFilters.passengerMin || bounds.max,
  )

  return {
    left: '0%',
    right: `${Math.max(0, 100 - end)}%`,
  }
})

const speedSliderStyle = computed(() => {
  const bounds = props.aircraftSidebarSpeedBounds || {}
  const end = rangeProgressEnd(
    bounds.min,
    bounds.max,
    props.aircraftSidebarFilters.speedMin || bounds.min,
  )

  return {
    left: '0%',
    right: `${Math.max(0, 100 - end)}%`,
  }
})

const detailAircraft = ref(null)

function resolvePricingBreakdown(aircraft = {}) {
  return getOfficialPricing(aircraft)
}

function resolveNumber(value, fallback = 0) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : fallback
}

function resolveAircraftSummaryHours(aircraft = {}) {
  return resolveNumber(getOfficialFinalBillableHours(aircraft, 0))
}

function resolveAircraftBillableTimeLabel(aircraft = {}) {
  const billableHours = resolveNumber(getOfficialBillableHours(aircraft, Number.NaN), Number.NaN)
  if (Number.isFinite(billableHours) && billableHours > 0) {
    return formatOfficialDisplayTime({ pricing_breakdown: { display_route_hours: billableHours } }, '0 min')
  }

  const finalBillableHours = resolveAircraftSummaryHours(aircraft)
  if (finalBillableHours > 0) {
    return formatOfficialDisplayTime({ pricing_breakdown: { display_route_hours: finalBillableHours } }, '0 min')
  }

  return '0 min'
}

function resolveAircraftVisibleTimeLabel(aircraft = {}) {
  return formatOfficialDisplayTime(aircraft, '0 min')
}

function resolveAircraftSummaryHourlyRate(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['hourly_rate', 'pricing_breakdown.hourly_rate'], 0))
}

function resolveAircraftSummaryFlightCost(aircraft = {}) {
  return resolveNumber(
    getOfficialPricingNumber(
      aircraft,
      ['client_flight_cost', 'pricing_breakdown.client_flight_cost', 'flight_cost', 'pricing_breakdown.flight_cost'],
      0,
    ),
  )
}

function resolveAircraftSummaryAirportExpenses(aircraft = {}) {
  return resolveNumber(
    getOfficialPricingNumber(
      aircraft,
      ['airport_expenses', 'pricing_breakdown.airport_expenses', 'expense_fee', 'pricing_breakdown.expense_fee'],
      0,
    ),
  )
}

function resolveAircraftSummaryOvernightNights(aircraft = {}) {
  return Math.round(resolveNumber(getOfficialPricingNumber(aircraft, ['overnight_nights', 'pricing_breakdown.overnight_nights'], 0)))
}

function resolveAircraftSummaryOvernightCost(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['overnight_cost', 'pricing_breakdown.overnight_cost'], 0))
}

function resolveAircraftSummaryOvernightRate(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['overnight_fee', 'pricing_breakdown.overnight_fee'], 0))
}

function resolveAircraftSummarySubtotal(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['subtotal', 'pricing_breakdown.subtotal'], 0))
}

function resolveAircraftSummaryStripeFee(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['stripe_fee', 'pricing_breakdown.stripe_fee'], 0))
}

function resolveAircraftSummaryAdministrativeFee(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['administrative_fee', 'pricing_breakdown.administrative_fee'], 0))
}

function resolveAircraftSummaryTaxes(aircraft = {}) {
  return resolveNumber(getOfficialPricingNumber(aircraft, ['tax', 'pricing_breakdown.tax', 'taxes', 'pricing_breakdown.taxes'], 0))
}

function resolveAircraftSummaryTotal(aircraft = {}) {
  return resolveNumber(getOfficialTotalAmount(aircraft, 0))
}

function resolveAircraftSummaryCurrency(aircraft = {}) {
  const breakdown = resolvePricingBreakdown(aircraft)
  return String(breakdown.currency || aircraft.currency || 'USD').toUpperCase()
}

function formatSummaryMoney(amount = 0, currency = 'USD') {
  const normalized = resolveNumber(amount)
  const decimals = Math.abs(normalized - Math.round(normalized)) < 0.01 ? 0 : 2
  return `${currency} ${normalized.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

function formatSummaryAmount(amount = 0) {
  const normalized = resolveNumber(amount)
  const decimals = Math.abs(normalized - Math.round(normalized)) < 0.01 ? 0 : 2
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatSummaryHours(hours = 0) {
  const normalized = resolveNumber(hours)
  const decimals = Math.abs(normalized - Math.round(normalized)) < 0.01 ? 0 : 2
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatSummaryPreciseHours(hours = 0) {
  const normalized = resolveNumber(hours)
  const decimals = Math.abs(normalized - Math.round(normalized)) < 0.0001 ? 0 : 4
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatSummaryPercent(amount = 0, subtotal = 0) {
  const normalizedSubtotal = resolveNumber(subtotal)
  if (normalizedSubtotal <= 0) return ''

  const percent = (resolveNumber(amount) / normalizedSubtotal) * 100
  const decimals = Math.abs(percent - Math.round(percent)) < 0.01 ? 0 : 1
  return percent.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function aircraftPricingSummaryLines(aircraft = {}) {
  const breakdown = resolvePricingBreakdown(aircraft)
  const currency = resolveAircraftSummaryCurrency(aircraft)
  const flightHours = resolveAircraftSummaryHours(aircraft)
  const visibleTime = resolveAircraftVisibleTimeLabel(aircraft)
  const hourlyRate = resolveAircraftSummaryHourlyRate(aircraft)
  const flightCost = resolveAircraftSummaryFlightCost(aircraft)
  const airportExpenses = resolveAircraftSummaryAirportExpenses(aircraft)
  const overnightNights = resolveAircraftSummaryOvernightNights(aircraft)
  const overnightRate = resolveAircraftSummaryOvernightRate(aircraft)
  const overnightCost = resolveAircraftSummaryOvernightCost(aircraft)
  const subtotal = resolveAircraftSummarySubtotal(aircraft)
  const stripeFee = resolveAircraftSummaryStripeFee(aircraft)
  const administrativeFee = resolveAircraftSummaryAdministrativeFee(aircraft)
  const taxes = resolveAircraftSummaryTaxes(aircraft)
  const total = resolveAircraftSummaryTotal(aircraft)
  const minimumApplied = Boolean(breakdown.minimum_applied)
  const hoursLabel = minimumApplied ? 'horas mínimas' : 'horas'
  const stripePercent = formatSummaryPercent(stripeFee, subtotal)
  const administrativePercent = formatSummaryPercent(administrativeFee, subtotal)

  return [
    'Tiempo estimado visible:',
    `${visibleTime}`,
    '',
    'Horas facturables exactas:',
    `${formatSummaryPreciseHours(flightHours)} ${hoursLabel}`,
    '',
    'Vuelo facturable:',
    `${formatSummaryPreciseHours(flightHours)} ${hoursLabel} × ${formatSummaryMoney(hourlyRate, currency)} = ${formatSummaryMoney(flightCost, currency)}`,
    '',
    'Gastos aeroportuarios:',
    `${formatSummaryMoney(airportExpenses, currency)}`,
    '',
    'Pernoctas:',
    overnightNights > 0
      ? `${overnightNights} × ${formatSummaryMoney(overnightRate, currency)} = ${formatSummaryMoney(overnightCost, currency)}`
      : `${formatSummaryMoney(overnightCost, currency)}`,
    '',
    'Subtotal operativo:',
    `${formatSummaryAmount(flightCost)} + ${formatSummaryAmount(airportExpenses)} + ${formatSummaryAmount(overnightCost)} = ${formatSummaryMoney(subtotal, currency)}`,
    '',
    `Stripe${stripePercent ? ` ${stripePercent}%` : ''}:`,
    `${formatSummaryMoney(stripeFee, currency)}`,
    '',
    `Administrativa${administrativePercent ? ` ${administrativePercent}%` : ''}:`,
    `${formatSummaryMoney(administrativeFee, currency)}`,
    '',
    'IVA:',
    `${formatSummaryMoney(taxes, currency)}`,
    '',
    'Total:',
    `${formatSummaryAmount(subtotal)} + ${formatSummaryAmount(stripeFee)} + ${formatSummaryAmount(administrativeFee)} + ${formatSummaryAmount(taxes)}`,
    `= ${formatSummaryMoney(total, currency)}`,
  ]
}

function openAircraftDetail(aircraft = null) {
  detailAircraft.value = aircraft
}

function closeAircraftDetail() {
  detailAircraft.value = null
}
</script>

<template>
  <section v-if="!props.isResultsSection" class="screen">
    <FlightSearchHero
      :commercial-access-action-disabled="props.commercialAccessActionDisabled"
      :commercial-access-cta-label="props.commercialAccessCtaLabel"
      :commercial-access-notice="props.commercialTrialNotice"
      :form="props.searchForm"
      :should-show-commercial-access-cta="props.shouldShowCommercialAccessCta"
      :submit-busy="props.searching || props.commercialAccessActionDisabled"
      :submit-label="
        props.commercialAccessActionDisabled
          ? 'Abriendo Stripe...'
          : shouldHighlightCommercialAccess
            ? 'Activar acceso para cotizar'
            : 'Cotizar vuelo'
      "
      :summary="props.itinerarySummary"
      :trip-type="props.tripType"
      @add-leg="$emit('add-leg')"
      @go-concierge="$emit('contact-concierge')"
      @go-commercial-access-payment="$emit('go-commercial-access-payment')"
      @remove-leg="$emit('remove-leg', $event)"
      @submit="$emit('submit-search')"
      @select-form-airport="$emit('select-form-airport', $event)"
      @select-leg-airport="$emit('select-leg-airport', $event)"
      @update-form-field="$emit('update-form-field', $event)"
      @update-leg-field="$emit('update-leg-field', $event)"
      @update-trip-type="$emit('update-trip-type', $event)"
    />
  </section>

  <section v-else class="screen screen--results">
    <transition name="reservation-loading-fade">
      <div
        v-if="props.reservationLoadingState?.active"
        class="reservation-loading-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-loading-title"
      >
        <div class="reservation-loading-backdrop"></div>
        <div class="reservation-loading-card">
          <div class="reservation-loading-glow" aria-hidden="true"></div>
          <div class="reservation-loading-spinner-shell">
            <div class="reservation-loading-spinner" aria-hidden="true">
              <span v-for="segment in 12" :key="`reservation-loading-segment-${segment}`"></span>
            </div>
          </div>
          <span class="reservation-loading-eyebrow">CENTRO OPERATIVO</span>
          <h3 id="reservation-loading-title">
            Preparando Nuestra Cabina
          </h3>
          <div class="reservation-loading-status-badge">
            {{ props.reservationLoadingState?.eyebrow || 'Solicitud en curso' }}
          </div>
          <p class="reservation-loading-copy">
            {{ props.reservationLoadingState?.message || 'Estamos asegurando la disponibilidad y preparando el siguiente paso de tu reservacion.' }}
          </p>
          <div class="reservation-loading-progress" aria-hidden="true">
            <span class="is-active">Bloqueando opcion</span>
            <span class="is-active">Validando tarifa</span>
            <span>Preparando contrato</span>
          </div>
          <p v-if="props.reservationLoadingState?.message" class="sr-only">
            {{ props.reservationLoadingState.message }}
          </p>
        </div>
      </div>
    </transition>

    <article
      class="commercial-access-banner"
      :class="[
        `commercial-access-banner--${props.commercialTrialNotice.tone}`,
        { 'commercial-access-banner--highlight': shouldHighlightCommercialAccess },
      ]"
    >
      <strong>{{ props.commercialTrialNotice.title }}</strong>
      <p>{{ props.commercialTrialNotice.message }}</p>
      <button
        v-if="props.shouldShowCommercialAccessCta"
        type="button"
        class="commercial-access-banner__action"
        :disabled="props.commercialAccessActionDisabled"
        @click="$emit('go-commercial-access-payment')"
      >
        {{ props.commercialAccessCtaLabel }}
      </button>
    </article>

    <div class="results-shell">
      <div class="results-trust-bar">
        <span
          class="results-trust-bar__account"
          :class="{ 'results-trust-bar__account--alert': shouldHighlightCommercialAccess }"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1 5h-2v2h2V7Zm0 4h-2v6h2v-6Z" fill="currentColor"/></svg>
          {{ trustBarCopy }}
        </span>
        <div class="results-trust-bar__pills">
          <span v-for="item in trustPills" :key="item">{{ item }}</span>
        </div>
      </div>

      <header class="results-hero">
        <div class="results-hero__copy">
          <span class="results-hero__eyebrow">Sky Group curated shortlist</span>
          <h2>{{ summaryHeadline }}</h2>
          <p class="results-hero__date">{{ summaryDateLine }}</p>
        </div>
        <button type="button" class="results-hero__edit" @click="$emit('modify-search')">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 17.25 9.06-9.06 3.75 3.75L7.75 21H4v-3.75Zm14.71-8.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.02 1.02 3.75 3.75 1.19-1.19Z" fill="currentColor"/></svg>
          Modificar busqueda
        </button>
      </header>

      <div class="filter-toolbar filter-toolbar--results">
        <div class="filter-row filter-row--pills">
          <button
            v-for="filter in props.resultFilterOptions"
            :key="filter.key"
            :aria-pressed="props.activeResultFilter === filter.key"
            :class="{ 'active-filter': props.activeResultFilter === filter.key }"
            type="button"
            @click="$emit('update:active-result-filter', filter.key)"
          >
            <strong>{{ filter.label }}</strong>
          </button>
        </div>
      </div>

      <div v-if="props.serverSearchError" class="empty-state">
        <p>{{ props.serverSearchError }}</p>
        <div class="empty-state__actions">
          <button type="button" class="ghost-action ghost-action--detail" @click="$emit('modify-search')">
            Modificar busqueda
          </button>
          <button type="button" @click="$emit('retry-search')">Intentar nuevamente</button>
          <button type="button" class="ghost-action ghost-action--detail" @click="$emit('contact-concierge')">
            Contactar Concierge
          </button>
        </div>
      </div>

      <div class="results-body">
        <aside class="results-sidebar">
          <div class="results-sidebar__card">
            <div class="results-sidebar__head">
              <strong>Filtros</strong>
              <button type="button" @click="$emit('clear-aircraft-sidebar-filters')">Limpiar</button>
            </div>

            <section class="sidebar-group">
              <h3>Tipo de aeronave</h3>
              <label
                v-for="type in props.aircraftSidebarTypeOptions"
                :key="type.label"
                class="sidebar-check"
              >
                <input
                  :checked="props.aircraftSidebarFilters.types.includes(type.label)"
                  type="checkbox"
                  @change="
                    $emit('update-aircraft-sidebar-filter', {
                      field: 'types',
                      value: $event.target.checked
                        ? [...props.aircraftSidebarFilters.types, type.label]
                        : props.aircraftSidebarFilters.types.filter((item) => item !== type.label),
                    })
                  "
                />
                <span>{{ type.label }}</span>
                <small>{{ type.count }}</small>
              </label>
            </section>

            <section class="sidebar-group">
              <h3>Capacidad de pasajeros</h3>
              <div class="sidebar-scale">
                <span>{{ props.aircraftSidebarPassengerBounds.min || 0 }}</span>
                <span>{{ props.aircraftSidebarFilters.passengerMin || props.aircraftSidebarPassengerBounds.max || 0 }}+</span>
              </div>
              <div class="sidebar-slider">
                <span :style="passengerSliderStyle"></span>
              </div>
              <input
                class="sidebar-range-input"
                type="range"
                :min="props.aircraftSidebarPassengerBounds.min || 0"
                :max="props.aircraftSidebarPassengerBounds.max || 0"
                :value="props.aircraftSidebarFilters.passengerMin || props.aircraftSidebarPassengerBounds.min || 0"
                @input="
                  $emit('update-aircraft-sidebar-filter', {
                    field: 'passengerMin',
                    value: Number($event.target.value),
                  })
                "
              />
            </section>

            <section class="sidebar-group">
              <h3>Rango de precio (USD)</h3>
              <div class="sidebar-range-grid">
                <label>
                  <span>Minimo</span>
                  <input
                    :value="props.aircraftSidebarFilters.priceMin"
                    inputmode="numeric"
                    type="text"
                    @input="
                      $emit('update-aircraft-sidebar-filter', {
                        field: 'priceMin',
                        value: $event.target.value.replace(/[^0-9]/g, ''),
                      })
                    "
                  />
                </label>
                <label>
                  <span>Maximo</span>
                  <input
                    :value="props.aircraftSidebarFilters.priceMax"
                    inputmode="numeric"
                    type="text"
                    @input="
                      $emit('update-aircraft-sidebar-filter', {
                        field: 'priceMax',
                        value: $event.target.value.replace(/[^0-9]/g, ''),
                      })
                    "
                  />
                </label>
              </div>
              <div class="sidebar-slider">
                <span :style="priceSliderStyle"></span>
              </div>
              <div class="sidebar-scale">
                <span>${{ formatWholeCurrency(props.aircraftSidebarPriceBounds.min) || 0 }}</span>
                <span>${{ formatWholeCurrency(props.aircraftSidebarPriceBounds.max) || 0 }}</span>
              </div>
            </section>

            <section class="sidebar-group">
              <h3>Velocidad minima</h3>
              <div class="sidebar-scale sidebar-scale--single">
                <span>{{ props.aircraftSidebarFilters.speedMin || props.aircraftSidebarSpeedBounds.min || 0 }} kts</span>
              </div>
              <div class="sidebar-slider">
                <span :style="speedSliderStyle"></span>
              </div>
              <input
                class="sidebar-range-input"
                type="range"
                :min="props.aircraftSidebarSpeedBounds.min || 0"
                :max="props.aircraftSidebarSpeedBounds.max || 0"
                :value="props.aircraftSidebarFilters.speedMin || props.aircraftSidebarSpeedBounds.min || 0"
                @input="
                  $emit('update-aircraft-sidebar-filter', {
                    field: 'speedMin',
                    value: Number($event.target.value),
                  })
                "
              />
            </section>

            <section v-if="props.aircraftSidebarServiceOptions.length" class="sidebar-group">
              <h3>Servicios incluidos</h3>
              <label
                v-for="service in props.aircraftSidebarServiceOptions"
                :key="service.label"
                class="sidebar-check"
              >
                <input
                  :checked="props.aircraftSidebarFilters.services.includes(service.label)"
                  type="checkbox"
                  @change="
                    $emit('update-aircraft-sidebar-filter', {
                      field: 'services',
                      value: $event.target.checked
                        ? [...props.aircraftSidebarFilters.services, service.label]
                        : props.aircraftSidebarFilters.services.filter((item) => item !== service.label),
                    })
                  "
                />
                <span>{{ service.label }}</span>
                <small>{{ service.count }}</small>
              </label>
            </section>

            <section class="sidebar-group">
              <h3>Aeropuertos</h3>
              <label class="sidebar-field">
                <span>Salida</span>
                <select>
                  <option>{{ selectedAirportLabel(props.searchForm.origin) }}</option>
                </select>
              </label>
              <label class="sidebar-field">
                <span>Destino</span>
                <select>
                  <option>{{ selectedAirportLabel(props.searchForm.destination) }}</option>
                </select>
              </label>
              <label class="sidebar-field" v-if="props.tripType === 'Redondo'">
                <span>Regreso</span>
                <select>
                  <option>{{ selectedAirportLabel(props.searchForm.origin) }}</option>
                </select>
              </label>
            </section>

            <button type="button" class="results-sidebar__save">Guardar busqueda</button>
          </div>
        </aside>

        <div class="results-main">
          <div class="results-toolbar">
            <strong>{{ resultsCountCopy }}</strong>
            <div class="results-toolbar__actions">
              <span>Ordenar por: <strong>Recomendado</strong></span>
              <button type="button" class="ghost-action">Comparar (0)</button>
              <button type="button" class="icon-action" aria-label="Vista cuadricula">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" fill="currentColor"/></svg>
              </button>
              <button type="button" class="icon-action" aria-label="Vista lista">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h4v4H4V6Zm6 1h10v2H10V7ZM4 14h4v4H4v-4Zm6 1h10v2H10v-2Z" fill="currentColor"/></svg>
              </button>
            </div>
          </div>

          <section v-if="showSearchSkeletons" class="results-section results-section--skeleton" aria-live="polite" aria-busy="true">
            <div class="aircraft-hero-card aircraft-hero-card--editorial aircraft-skeleton-card aircraft-skeleton-card--hero">
              <div class="aircraft-skeleton-card__media skeleton-block"></div>
              <div class="aircraft-skeleton-card__content">
                <div class="aircraft-skeleton-line aircraft-skeleton-line--eyebrow skeleton-block"></div>
                <div class="aircraft-skeleton-line aircraft-skeleton-line--title skeleton-block"></div>
                <div class="aircraft-skeleton-line aircraft-skeleton-line--price skeleton-block"></div>
                <div class="aircraft-skeleton-chips">
                  <span v-for="chip in 3" :key="`hero-skeleton-chip-${chip}`" class="aircraft-skeleton-chip skeleton-block"></span>
                </div>
                <div class="aircraft-skeleton-line aircraft-skeleton-line--body skeleton-block"></div>
                <div class="aircraft-skeleton-actions">
                  <span class="aircraft-skeleton-button aircraft-skeleton-button--primary skeleton-block"></span>
                  <span class="aircraft-skeleton-button skeleton-block"></span>
                </div>
              </div>
            </div>

            <div class="aircraft-list aircraft-list-compact aircraft-list-compact--refined">
              <article
                v-for="card in skeletonCards"
                :key="`result-skeleton-${card}`"
                class="aircraft-card aircraft-card-compact aircraft-card-compact--refined aircraft-skeleton-card"
              >
                <div class="aircraft-skeleton-card__media skeleton-block"></div>
                <div class="aircraft-skeleton-card__content">
                  <div class="aircraft-skeleton-line aircraft-skeleton-line--eyebrow skeleton-block"></div>
                  <div class="aircraft-skeleton-line aircraft-skeleton-line--title skeleton-block"></div>
                  <div class="aircraft-skeleton-line aircraft-skeleton-line--price skeleton-block"></div>
                  <div class="aircraft-skeleton-chips">
                    <span v-for="chip in 3" :key="`card-${card}-chip-${chip}`" class="aircraft-skeleton-chip skeleton-block"></span>
                  </div>
                  <div class="aircraft-skeleton-actions">
                    <span class="aircraft-skeleton-button aircraft-skeleton-button--primary skeleton-block"></span>
                    <span class="aircraft-skeleton-button skeleton-block"></span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <div v-else-if="showSearchEmptyState" class="empty-state">
            <p>No encontramos aeronaves disponibles en el aeropuerto de origen ni en bases cercanas dentro del radio operativo.</p>
            <div class="empty-state__actions">
              <button type="button" class="ghost-action ghost-action--detail" @click="$emit('modify-search')">
                Modificar busqueda
              </button>
              <button type="button" @click="$emit('retry-search')">Intentar nuevamente</button>
              <button type="button" class="ghost-action ghost-action--detail" @click="$emit('contact-concierge')">
                Contactar Concierge
              </button>
            </div>
          </div>

          <article
            v-if="!showSearchSkeletons && props.featuredAircraft"
            class="aircraft-hero-card aircraft-hero-card--editorial"
            :class="{ 'aircraft-card--unavailable': !aircraftIsAvailable(props.featuredAircraft) }"
          >
            <div
              class="aircraft-thumb aircraft-thumb-hero aircraft-thumb-hero--single"
              :class="{ 'aircraft-thumb--placeholder': !props.featuredAircraft.image_url }"
              :style="props.aircraftVisualStyle(props.featuredAircraft.image_url)"
            >
              <img
                v-if="props.featuredAircraft.image_url"
                :src="props.featuredAircraft.image_url"
                :alt="props.featuredAircraft.aircraft"
                loading="lazy"
              />
              <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
              <div class="aircraft-thumb__overlay">
                <span class="aircraft-thumb__badge">Recomendado por asesor</span>
              </div>
            </div>

            <div class="aircraft-hero-copy aircraft-hero-copy--editorial">
              <div class="aircraft-hero-copy__header">
                <div>
                  <span class="eyebrow">Recomendado por asesor</span>
                  <h3>{{ props.featuredAircraft.aircraft }}</h3>
                </div>
                <div class="aircraft-hero-copy__price">
                  <span>Tarifa estimada total</span>
                  <strong class="hero-price">{{ props.aircraftPriceCopy(props.featuredAircraft) }}</strong>
                </div>
              </div>

              <div class="aircraft-hero-chips">
                <span
                  v-for="item in aircraftFactChips(props.featuredAircraft, props.activeItinerarySummary, {
                    aircraftClassLabel: props.aircraftClassLabel,
                    aircraftCapacityLabel: props.aircraftCapacityLabel,
                    aircraftSpeedLine: props.aircraftSpeedLine,
                  })"
                  :key="item"
                >
                  {{ item }}
                </span>
              </div>

              <div v-if="props.featuredAircraft.requires_repositioning" class="repositioning-note">
                <strong>Reposicionamiento desde {{ repositioningBaseLabel(props.featuredAircraft) }}</strong>
                <span>{{ repositioningRouteLabel(props.featuredAircraft) }}</span>
                <span>{{ repositioningMetaLabel(props.featuredAircraft) }}</span>
                <small>Incluido en la tarifa</small>
              </div>

              <p class="hero-service-copy">
                Experiencia priorizada para decidir rapido: una foto principal, lectura inmediata del precio
                y beneficios visibles en un solo bloque.
              </p>

              <p
                v-if="props.aircraftBackendBillableHoursLabel(props.featuredAircraft)"
                class="aircraft-billing-note"
              >
                {{ props.aircraftBackendBillableHoursLabel(props.featuredAircraft) }}
              </p>
              <p v-if="props.aircraftBillingNote(props.featuredAircraft)" class="aircraft-billing-note">
                {{ props.aircraftBillingNote(props.featuredAircraft) }}
              </p>
              <p v-if="!aircraftIsAvailable(props.featuredAircraft)" class="aircraft-unavailable-note">
                Aeronave no disponible para este horario
              </p>

              <div class="hero-includes hero-includes--editorial">
                <span v-for="item in props.aircraftIncludes(props.featuredAircraft)" :key="item">{{ item }}</span>
              </div>

              <div class="hero-actions hero-actions--editorial">
                <button
                  type="button"
                  :disabled="Boolean(props.reservingAircraftId) || !aircraftIsAvailable(props.featuredAircraft)"
                  @click="$emit('request-reservation', props.featuredAircraft)"
                >
                  {{ props.reservationActionLabel(props.featuredAircraft) }}
                </button>
                <button
                  type="button"
                  class="ghost-action ghost-action--detail"
                  @click="openAircraftDetail(props.featuredAircraft)"
                >
                  Ver detalles
                </button>
              </div>
            </div>
          </article>

          <section v-if="!showSearchSkeletons && props.secondaryAircraftOptions.length" class="results-section">
            <div class="aircraft-list aircraft-list-compact aircraft-list-compact--refined">
              <article
                v-for="(aircraft, index) in props.secondaryAircraftOptions"
                :key="aircraft.id"
                class="aircraft-card aircraft-card-compact aircraft-card-compact--refined"
                :class="{ 'aircraft-card--unavailable': !aircraftIsAvailable(aircraft) }"
              >
                <div
                  class="aircraft-thumb aircraft-thumb--card"
                  :class="{ 'aircraft-thumb--placeholder': !aircraft.image_url }"
                  :style="props.aircraftVisualStyle(aircraft.image_url)"
                >
                  <img
                    v-if="aircraft.image_url"
                    :src="aircraft.image_url"
                    :alt="aircraft.aircraft"
                    loading="lazy"
                  />
                  <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
                  <div class="aircraft-thumb__overlay">
                    <span class="aircraft-thumb__rank">{{ props.aircraftClassLabel(aircraft) }}</span>
                  </div>
                </div>

                <div class="aircraft-copy aircraft-copy--refined">
                  <div class="aircraft-card-head aircraft-card-head--refined">
                    <div class="aircraft-card-head__copy">
                      <span class="eyebrow">{{ resultRankLabel(index + 1) }}</span>
                      <h3>{{ aircraft.aircraft }}</h3>
                    </div>
                    <div class="aircraft-price-line aircraft-price-line--refined">
                      <span>Tarifa total</span>
                      <strong>{{ props.aircraftPriceCopy(aircraft) }}</strong>
                    </div>
                  </div>

                  <div class="aircraft-quick-meta aircraft-quick-meta--refined">
                    <span
                      v-for="item in aircraftFactChips(aircraft, props.activeItinerarySummary, {
                        aircraftClassLabel: props.aircraftClassLabel,
                        aircraftCapacityLabel: props.aircraftCapacityLabel,
                        aircraftSpeedLine: props.aircraftSpeedLine,
                      })"
                      :key="item"
                    >
                      {{ item }}
                    </span>
                  </div>
                  <div v-if="aircraft.requires_repositioning" class="repositioning-note repositioning-note--compact">
                    <strong>Reposicionamiento desde {{ repositioningBaseLabel(aircraft) }}</strong>
                    <span>{{ repositioningRouteLabel(aircraft) }}</span>
                    <span>{{ repositioningMetaLabel(aircraft) }}</span>
                    <small>Incluido en la tarifa</small>
                  </div>
                  <p
                    v-if="props.aircraftBackendBillableHoursLabel(aircraft)"
                    class="aircraft-billing-note"
                  >
                    {{ props.aircraftBackendBillableHoursLabel(aircraft) }}
                  </p>
                  <p v-if="props.aircraftBillingNote(aircraft)" class="aircraft-billing-note">
                    {{ props.aircraftBillingNote(aircraft) }}
                  </p>
                  <p v-if="!aircraftIsAvailable(aircraft)" class="aircraft-unavailable-note">
                    Aeronave no disponible para este horario
                  </p>
                  <div class="card-actions card-actions--refined">
                    <button
                      type="button"
                      :disabled="Boolean(props.reservingAircraftId) || !aircraftIsAvailable(aircraft)"
                      @click="$emit('request-reservation', aircraft)"
                    >
                      {{ props.reservationActionLabel(aircraft) }}
                    </button>
                    <button
                      type="button"
                      class="ghost-action ghost-action--detail"
                      @click="openAircraftDetail(aircraft)"
                    >
                      Ver detalles
                    </button>
                    <label class="compare-check">
                      <input type="checkbox" />
                      <span>Comparar</span>
                    </label>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>

      <footer class="results-footer">
        <div class="results-benefits">
          <article v-for="item in serviceBenefits" :key="item.title" class="results-benefits__card">
            <span class="results-benefits__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 2 4 6v6c0 5.25 3.44 9.78 8 11 4.56-1.22 8-5.75 8-11V6l-8-4Zm0 3.18 5 2.5V12c0 3.95-2.39 7.51-5 8.73C9.39 19.51 7 15.95 7 12V7.68l5-2.5Z" fill="currentColor"/></svg>
            </span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ item.copy }}</p>
            </div>
          </article>
        </div>

        <article class="results-concierge">
          <div class="results-concierge__copy">
            <span>Concierge 24/7</span>
            <strong>Estamos para ayudarte en cada detalle de tu viaje.</strong>
          </div>
          <button type="button" @click="$emit('contact-concierge')">Contactar Concierge</button>
        </article>
      </footer>

      <div class="results-footnote">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h-1V6a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2ZM10 6a2 2 0 1 1 4 0v2h-4V6Zm3 9.73V18h-2v-2.27a2 2 0 1 1 2 0Z" fill="currentColor"/></svg>
        <span>Cotizacion gratuita y sin compromiso. Tarifas sujetas a disponibilidad.</span>
      </div>

      <div
        v-if="detailAircraft"
        class="aircraft-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de cotización"
        @click.self="closeAircraftDetail"
      >
        <div class="aircraft-detail-modal__card">
          <div class="aircraft-detail-modal__header">
            <div>
              <span class="eyebrow">Detalle de cotización</span>
              <h3>{{ detailAircraft.aircraft }}</h3>
            </div>
            <button type="button" class="aircraft-detail-modal__close" @click="closeAircraftDetail">
              Cerrar
            </button>
          </div>

          <div class="aircraft-detail-modal__price">
            <span>Tarifa estimada total</span>
            <strong>{{ props.aircraftPriceCopy(detailAircraft) }}</strong>
          </div>

          <pre class="aircraft-detail-modal__summary">{{ aircraftPricingSummaryLines(detailAircraft).join('\n') }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.screen--results {
  gap: 1.25rem;
  width: calc(100vw - 2rem);
  margin-left: calc(50% - 50vw + 1rem);
  margin-right: calc(50% - 50vw + 1rem);
}

.reservation-loading-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.reservation-loading-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 20%, rgba(101, 140, 214, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(16, 23, 35, 0.76), rgba(10, 15, 24, 0.82));
  backdrop-filter: blur(22px) saturate(120%);
}

.reservation-loading-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.95rem;
  width: min(100%, 29rem);
  min-height: 25rem;
  padding: 2.25rem 2rem 2rem;
  border: 1px solid rgba(138, 156, 189, 0.18);
  border-radius: 32px;
  background:
    radial-gradient(circle at top, rgba(133, 164, 226, 0.14), transparent 30%),
    linear-gradient(145deg, rgba(11, 28, 62, 0.98), rgba(6, 18, 43, 0.98));
  box-shadow:
    0 40px 90px rgba(4, 10, 23, 0.42),
    0 18px 42px rgba(12, 30, 68, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  text-align: center;
  overflow: hidden;
}

.reservation-loading-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.05), transparent 32%),
    radial-gradient(circle at 50% 100%, rgba(129, 167, 232, 0.08), transparent 30%);
  pointer-events: none;
}

.reservation-loading-glow {
  position: absolute;
  top: -12%;
  left: 50%;
  width: 70%;
  height: 10rem;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(121, 156, 220, 0.28), transparent 68%);
  filter: blur(24px);
  opacity: 0.9;
}

.reservation-loading-status-badge {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.8rem;
  margin-top: 0.15rem;
  border: 1px solid rgba(182, 203, 241, 0.18);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: #c8d7f4;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.reservation-loading-status-badge::before {
  content: '';
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: #93b6ff;
  box-shadow: 0 0 0 0 rgba(147, 182, 255, 0.45);
  animation: reservation-loading-ping 1.8s ease-out infinite;
}

.reservation-loading-spinner-shell {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: clamp(8.25rem, 22vw, 9.5rem);
  height: clamp(8.25rem, 22vw, 9.5rem);
  margin-top: 0.5rem;
  margin-bottom: 0.4rem;
  border: 1px solid rgba(147, 171, 215, 0.12);
  border-radius: 34px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02)),
    rgba(4, 13, 34, 0.42);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    inset 0 -20px 40px rgba(5, 15, 35, 0.2);
  overflow: hidden;
}

.reservation-loading-spinner-shell::before {
  content: '';
  position: absolute;
  inset: 1rem;
  border-radius: 26px;
  border: 1px solid rgba(196, 211, 243, 0.06);
}

.reservation-loading-spinner {
  position: relative;
  flex: 0 0 auto;
  width: clamp(4.6rem, 13vw, 5.6rem);
  height: clamp(4.6rem, 13vw, 5.6rem);
  filter: drop-shadow(0 10px 22px rgba(1, 10, 26, 0.24));
}

.reservation-loading-spinner span {
  position: absolute;
  top: 50%;
  left: 50%;
  width: clamp(0.5rem, 0.9vw, 0.62rem);
  height: clamp(1.35rem, 3.4vw, 1.8rem);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 248, 236, 0.98), rgba(131, 144, 170, 0.22));
  transform-origin: center calc(clamp(1.25rem, 3.2vw, 1.65rem) * -1);
  animation: reservation-loading-spinner-fade 1.2s linear infinite;
}

.reservation-loading-spinner span:nth-child(1) { transform: translate(-50%, -50%) rotate(0deg); animation-delay: -1.1s; }
.reservation-loading-spinner span:nth-child(2) { transform: translate(-50%, -50%) rotate(30deg); animation-delay: -1s; }
.reservation-loading-spinner span:nth-child(3) { transform: translate(-50%, -50%) rotate(60deg); animation-delay: -0.9s; }
.reservation-loading-spinner span:nth-child(4) { transform: translate(-50%, -50%) rotate(90deg); animation-delay: -0.8s; }
.reservation-loading-spinner span:nth-child(5) { transform: translate(-50%, -50%) rotate(120deg); animation-delay: -0.7s; }
.reservation-loading-spinner span:nth-child(6) { transform: translate(-50%, -50%) rotate(150deg); animation-delay: -0.6s; }
.reservation-loading-spinner span:nth-child(7) { transform: translate(-50%, -50%) rotate(180deg); animation-delay: -0.5s; }
.reservation-loading-spinner span:nth-child(8) { transform: translate(-50%, -50%) rotate(210deg); animation-delay: -0.4s; }
.reservation-loading-spinner span:nth-child(9) { transform: translate(-50%, -50%) rotate(240deg); animation-delay: -0.3s; }
.reservation-loading-spinner span:nth-child(10) { transform: translate(-50%, -50%) rotate(270deg); animation-delay: -0.2s; }
.reservation-loading-spinner span:nth-child(11) { transform: translate(-50%, -50%) rotate(300deg); animation-delay: -0.1s; }
.reservation-loading-spinner span:nth-child(12) { transform: translate(-50%, -50%) rotate(330deg); animation-delay: 0s; }

.reservation-loading-eyebrow {
  position: relative;
  z-index: 1;
  color: #7f92b3;
  font-size: clamp(0.72rem, 1.5vw, 0.84rem);
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin-top: 0.2rem;
}

.reservation-loading-card h3 {
  position: relative;
  z-index: 1;
  margin: 0;
  max-width: 7.4ch;
  color: #fff9f0;
  font-size: clamp(2rem, 4.4vw, 3rem);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.05em;
  text-wrap: balance;
}

.reservation-loading-copy {
  position: relative;
  z-index: 1;
  max-width: 24rem;
  margin: 0;
  color: rgba(222, 232, 248, 0.82);
  font-size: 0.98rem;
  line-height: 1.55;
  text-wrap: balance;
}

.reservation-loading-progress {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.3rem;
}

.reservation-loading-progress span {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid rgba(173, 193, 229, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(222, 232, 248, 0.68);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.reservation-loading-progress span::before {
  content: '';
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.45;
}

.reservation-loading-progress .is-active {
  border-color: rgba(212, 226, 255, 0.18);
  background: rgba(255, 255, 255, 0.07);
  color: #f5f8ff;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes reservation-loading-spinner-fade {
  0%, 39%, 100% {
    opacity: 0.18;
  }

  40% {
    opacity: 1;
  }
}

@keyframes reservation-loading-ping {
  0% {
    box-shadow: 0 0 0 0 rgba(147, 182, 255, 0.45);
  }

  70% {
    box-shadow: 0 0 0 10px rgba(147, 182, 255, 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(147, 182, 255, 0);
  }
}

.reservation-loading-fade-enter-active,
.reservation-loading-fade-leave-active {
  transition: opacity 0.22s ease;
}

.reservation-loading-fade-enter-from,
.reservation-loading-fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .reservation-loading-card {
    width: min(100%, 25.5rem);
    min-height: 23rem;
    padding: 1.9rem 1.55rem 1.85rem;
  }
}

@media (max-width: 640px) {
  .reservation-loading-modal {
    padding: 1rem;
  }

  .reservation-loading-card {
    width: min(100%, 21rem);
    min-height: 20.5rem;
    padding: 1.6rem 1.1rem 1.35rem;
    gap: 0.78rem;
    border-radius: 26px;
  }

  .reservation-loading-spinner-shell {
    width: 7.6rem;
    height: 7.6rem;
  }

  .reservation-loading-card h3 {
    max-width: 7.4ch;
    font-size: clamp(1.75rem, 8vw, 2.35rem);
  }

  .reservation-loading-copy {
    font-size: 0.9rem;
  }

  .reservation-loading-progress {
    gap: 0.45rem;
  }

  .reservation-loading-progress span {
    padding: 0.48rem 0.68rem;
    font-size: 0.68rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reservation-loading-spinner span,
  .reservation-loading-status-badge::before {
    animation: none;
  }
}

.results-shell {
  display: grid;
  gap: 1.15rem;
  width: 100%;
  max-width: 1760px;
  margin: 0 auto;
}

.results-trust-bar {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 0.15rem 0;
}

.results-trust-bar__account {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #605947;
  font-size: 0.85rem;
  font-weight: 600;
}

.results-trust-bar__account svg {
  width: 1rem;
  height: 1rem;
  color: #c7952f;
}

.results-trust-bar__pills {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}

.results-trust-bar__pills span {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(199, 149, 47, 0.16);
  background: rgba(255, 255, 255, 0.72);
  color: #8b6a24;
  font-size: 0.75rem;
  font-weight: 700;
}

.results-hero {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  padding: 1.45rem 1.6rem;
  border: 1px solid rgba(220, 210, 190, 0.8);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(251,248,242,0.98));
  box-shadow: 0 20px 60px rgba(86, 59, 10, 0.07);
}

.results-hero__copy {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.results-hero__eyebrow {
  color: #3b82f6;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.results-hero__copy h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(2rem, 3vw, 3.15rem);
  line-height: 1.02;
  letter-spacing: -0.05em;
  overflow-wrap: anywhere;
}

.results-hero__date {
  margin: 0;
  color: #64748b;
  font-size: 0.95rem;
}

.results-hero__edit {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.8rem;
  padding: 0 1rem;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 12px;
  background: #ffffff;
  color: #111827;
  font-size: 0.88rem;
  font-weight: 700;
}

.results-hero__edit svg {
  width: 0.95rem;
  height: 0.95rem;
}

.filter-toolbar--results {
  padding: 0.7rem;
  border-radius: 22px;
  border: 1px solid rgba(220, 210, 190, 0.8);
  background: rgba(255,255,255,0.92);
  box-shadow: 0 12px 36px rgba(86, 59, 10, 0.05);
}

.filter-row--pills {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.filter-row--pills button {
  min-height: 2.6rem;
  padding: 0 1rem;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #ffffff;
  color: #111827;
  font-size: 0.82rem;
  font-weight: 700;
}

.filter-row--pills button.active-filter {
  background: #14213d;
  color: #ffffff;
  border-color: #14213d;
}

.empty-state {
  padding: 1rem 1.15rem;
  border-radius: 18px;
  border: 1px solid rgba(220, 210, 190, 0.8);
  background: #ffffff;
  color: #5b6471;
}

.empty-state {
  display: grid;
  gap: 1rem;
}

.empty-state p {
  margin: 0;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}

.empty-state__actions button {
  min-height: 2.9rem;
  padding: 0 1.1rem;
  border-radius: 999px;
  border: 1px solid rgba(28, 55, 108, 0.16);
  background: #204286;
  color: #ffffff;
  font-size: 0.92rem;
  font-weight: 800;
}

.empty-state__actions .ghost-action {
  background: #ffffff;
  color: #1c376c;
}

.results-section--skeleton {
  display: grid;
  gap: 1.25rem;
}

.aircraft-skeleton-card {
  overflow: hidden;
}

.aircraft-skeleton-card--hero {
  display: grid;
  grid-template-columns: minmax(280px, 1.25fr) minmax(320px, 1fr);
  gap: 1.4rem;
}

.aircraft-skeleton-card__media {
  min-height: 19rem;
  border-radius: 2rem;
}

.aircraft-skeleton-card__content {
  display: grid;
  align-content: center;
  gap: 0.95rem;
  min-width: 0;
}

.aircraft-skeleton-line,
.aircraft-skeleton-chip,
.aircraft-skeleton-button,
.skeleton-block {
  position: relative;
  overflow: hidden;
  background: linear-gradient(90deg, rgba(232, 236, 244, 0.95), rgba(245, 247, 251, 1), rgba(232, 236, 244, 0.95));
}

.aircraft-skeleton-line::after,
.aircraft-skeleton-chip::after,
.aircraft-skeleton-button::after,
.skeleton-block::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent);
  animation: skeleton-shimmer 1.25s ease-in-out infinite;
}

.aircraft-skeleton-line {
  border-radius: 999px;
}

.aircraft-skeleton-line--eyebrow {
  width: 9rem;
  height: 0.9rem;
}

.aircraft-skeleton-line--title {
  width: min(100%, 18rem);
  height: 2.1rem;
}

.aircraft-skeleton-line--price {
  width: 10rem;
  height: 1.4rem;
}

.aircraft-skeleton-line--body {
  width: min(100%, 24rem);
  height: 1rem;
}

.aircraft-skeleton-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
}

.aircraft-skeleton-chip {
  width: 7.4rem;
  height: 2.7rem;
  border-radius: 999px;
}

.aircraft-skeleton-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 0.2rem;
}

.aircraft-skeleton-button {
  width: 10rem;
  height: 3.3rem;
  border-radius: 1rem;
}

.aircraft-skeleton-button--primary {
  width: 12rem;
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

.results-body {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 1.15rem;
  align-items: start;
}

.results-sidebar__card {
  position: sticky;
  top: 6rem;
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border-radius: 24px;
  border: 1px solid rgba(220, 210, 190, 0.8);
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(251,248,242,0.98));
  box-shadow: 0 16px 44px rgba(86, 59, 10, 0.06);
}

.results-sidebar__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.results-sidebar__head strong {
  color: #111827;
  font-size: 1.1rem;
}

.results-sidebar__head button {
  min-height: 0;
  padding: 0;
  background: transparent;
  color: #55719b;
  font-size: 0.8rem;
  font-weight: 700;
}

.sidebar-group {
  display: grid;
  gap: 0.65rem;
  padding-top: 0.15rem;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.sidebar-group:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.sidebar-group h3 {
  margin: 0;
  color: #1f2937;
  font-size: 0.88rem;
}

.sidebar-check {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.45rem;
  align-items: center;
  color: #5f6672;
  font-size: 0.82rem;
}

.sidebar-check input {
  margin: 0;
}

.sidebar-check small {
  color: #8a91a0;
}

.sidebar-scale {
  display: flex;
  justify-content: space-between;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
}

.sidebar-slider {
  position: relative;
  height: 0.35rem;
  border-radius: 999px;
  background: #e4e8ef;
}

.sidebar-slider span {
  position: absolute;
  inset: 0.03rem 14% 0.03rem 8%;
  border-radius: 999px;
  background: linear-gradient(90deg, #14213d, #1d4ed8);
}

.sidebar-range-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

.sidebar-range-grid label,
.sidebar-field {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}

.sidebar-range-grid span,
.sidebar-field span {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 700;
}

.sidebar-range-grid input,
.sidebar-field select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 2.55rem;
  border: 1px solid rgba(205, 212, 223, 0.95);
  border-radius: 12px;
  padding: 0 0.75rem;
  background: #ffffff;
  color: #111827;
  font: inherit;
}

.sidebar-range-input {
  width: 100%;
  margin: 0;
  accent-color: #1d4ed8;
}

.results-sidebar__save {
  min-height: 2.85rem;
  border: 1px solid rgba(33, 72, 139, 0.18);
  border-radius: 14px;
  background: #ffffff;
  color: #1d4ed8;
  font-size: 0.86rem;
  font-weight: 700;
}

.results-main {
  display: grid;
  gap: 1.15rem;
}

.results-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.95rem 1rem;
  border-radius: 20px;
  border: 1px solid rgba(220, 210, 190, 0.8);
  background: rgba(255,255,255,0.94);
  box-shadow: 0 12px 30px rgba(86, 59, 10, 0.05);
}

.results-toolbar strong,
.results-toolbar span {
  color: #4b5563;
  font-size: 0.86rem;
}

.results-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.ghost-action,
.icon-action {
  border-radius: 12px;
  background: #ffffff;
  color: #14213d;
  border: 1px solid rgba(15, 23, 42, 0.12);
  font-weight: 700;
}

.ghost-action {
  min-height: 2.6rem;
  padding: 0 0.95rem;
}

.icon-action {
  width: 2.6rem;
  min-height: 2.6rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-action svg {
  width: 1rem;
  height: 1rem;
}

.aircraft-hero-card--editorial,
.aircraft-card-compact--refined {
  display: grid;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(191, 197, 211, 0.72);
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(86, 59, 10, 0.07);
}

.aircraft-hero-card--editorial {
  grid-template-columns: minmax(340px, 1.15fr) minmax(360px, 0.95fr);
  align-items: stretch;
}

.aircraft-card--unavailable {
  opacity: 0.78;
}

.aircraft-thumb {
  position: relative;
  display: block;
  overflow: hidden;
  background: linear-gradient(135deg, #dbe4f0, #eef2f7);
}

.aircraft-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aircraft-thumb-hero--single {
  height: 100%;
  min-height: 370px;
}

.aircraft-thumb--card {
  height: 100%;
  min-height: 270px;
}

.aircraft-thumb__overlay {
  position: absolute;
  inset: 0.9rem 0.9rem auto 0.9rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.aircraft-thumb__badge,
.aircraft-thumb__rank {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.92);
  color: #14213d;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.aircraft-hero-copy--editorial {
  display: grid;
  gap: 1.1rem;
  align-content: start;
  padding: 1.25rem 1.35rem;
}

.aircraft-hero-copy__header,
.aircraft-card-head--refined {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.eyebrow {
  color: #9b7a29;
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.aircraft-hero-copy__header h3,
.aircraft-card-head--refined h3 {
  margin: 0.3rem 0 0;
  color: #0f172a;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.aircraft-hero-copy__header h3 {
  font-size: clamp(2rem, 2.4vw, 2.6rem);
}

.aircraft-card-head--refined h3 {
  font-size: 1.55rem;
}

.aircraft-hero-copy__price,
.aircraft-price-line--refined {
  display: grid;
  gap: 0.15rem;
  justify-items: end;
  text-align: right;
}

.aircraft-hero-copy__price span,
.aircraft-price-line--refined span {
  color: #64748b;
  font-size: 0.78rem;
}

.aircraft-hero-copy__price strong {
  color: #0f172a;
  font-size: 1.9rem;
  line-height: 1;
}

.aircraft-price-line--refined strong {
  color: #0f172a;
  font-size: 1.6rem;
  line-height: 1;
}

.aircraft-hero-chips,
.aircraft-quick-meta--refined,
.hero-includes--editorial {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.aircraft-hero-chips span,
.aircraft-quick-meta--refined span,
.hero-includes--editorial span {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0 0.75rem;
  border-radius: 999px;
  background: #f3f6fb;
  border: 1px solid rgba(205, 212, 223, 0.95);
  color: #334155;
  font-size: 0.78rem;
  font-weight: 700;
}

.hero-service-copy,
.aircraft-billing-note {
  margin: 0;
  color: #5f6672;
  font-size: 0.84rem;
  line-height: 1.5;
  max-width: 56ch;
}

.repositioning-note {
  display: grid;
  gap: 0.16rem;
  padding: 0.8rem 0.95rem;
  border-radius: 16px;
  background: #f7f9fc;
  border: 1px solid rgba(205, 212, 223, 0.95);
  color: #475569;
}

.repositioning-note strong {
  color: #17336d;
  font-size: 0.84rem;
}

.repositioning-note span,
.repositioning-note small {
  font-size: 0.78rem;
  line-height: 1.35;
}

.repositioning-note small {
  color: #64748b;
}

.aircraft-unavailable-note {
  margin: 0;
  color: #b91c1c;
  font-size: 0.82rem;
  font-weight: 700;
}

.hero-actions--editorial,
.card-actions--refined {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.hero-actions--editorial > button:first-child,
.card-actions--refined > button:first-child {
  min-height: 2.75rem;
  padding: 0 1.2rem;
  border-radius: 12px;
  background: #17336d;
  color: #ffffff;
  font-size: 0.86rem;
  font-weight: 800;
  box-shadow: 0 14px 28px rgba(23, 51, 109, 0.22);
}

.ghost-action--detail {
  color: #17336d;
}

.compare-check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #64748b;
  font-size: 0.8rem;
}

.compare-check input {
  margin: 0;
}

.results-section {
  display: grid;
  gap: 1rem;
}

.aircraft-list-compact--refined {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.aircraft-card-compact--refined {
  grid-template-columns: minmax(210px, 0.52fr) minmax(0, 0.48fr);
  min-height: 270px;
}

.aircraft-copy--refined {
  display: grid;
  gap: 0.75rem;
  align-content: start;
  padding: 1rem;
}

.results-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  gap: 1rem;
  align-items: stretch;
}

.results-benefits {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(220, 210, 190, 0.8);
  background: rgba(255,255,255,0.94);
  box-shadow: 0 12px 30px rgba(86, 59, 10, 0.05);
}

.results-benefits__card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem;
  padding: 1.1rem;
  border-right: 1px solid rgba(230, 225, 214, 0.9);
}

.results-benefits__card:last-child {
  border-right: 0;
}

.results-benefits__icon {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #f8f4ea;
  color: #9b7a29;
}

.results-benefits__icon svg {
  width: 1rem;
  height: 1rem;
}

.results-benefits__card strong {
  color: #111827;
  font-size: 0.78rem;
}

.results-benefits__card p {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.45;
}

.results-concierge {
  display: grid;
  gap: 1rem;
  align-content: start;
  padding: 1.15rem;
  border-radius: 24px;
  background: linear-gradient(180deg, #172449, #0f1730);
  color: #ffffff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.results-concierge__copy {
  display: grid;
  gap: 0.35rem;
}

.results-concierge__copy span {
  color: #d7b35f;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.results-concierge__copy strong {
  font-size: 0.96rem;
  line-height: 1.45;
}

.results-concierge button {
  min-height: 2.9rem;
  border-radius: 14px;
  background: linear-gradient(180deg, #d6a63b, #ba8b2d);
  color: #ffffff;
  font-weight: 800;
}

.results-footnote {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: #717986;
  font-size: 0.82rem;
}

.results-footnote svg {
  width: 0.95rem;
  height: 0.95rem;
}

.aircraft-detail-modal {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(12, 18, 30, 0.55);
  backdrop-filter: blur(10px);
}

.aircraft-detail-modal__card {
  width: min(100%, 44rem);
  max-height: min(85vh, 52rem);
  overflow: auto;
  border-radius: 1.5rem;
  background: #fffdf9;
  box-shadow: 0 30px 80px rgba(12, 18, 30, 0.24);
  padding: 1.5rem;
}

.aircraft-detail-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.aircraft-detail-modal__header h3 {
  margin: 0.35rem 0 0;
  font-size: clamp(1.8rem, 3vw, 2.4rem);
  color: #15213b;
}

.aircraft-detail-modal__close {
  border: 0;
  border-radius: 999px;
  background: rgba(21, 33, 59, 0.08);
  color: #15213b;
  padding: 0.75rem 1rem;
  font-weight: 700;
  cursor: pointer;
}

.aircraft-detail-modal__price {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 1.25rem;
}

.aircraft-detail-modal__price span {
  font-size: 0.9rem;
  color: rgba(21, 33, 59, 0.62);
}

.aircraft-detail-modal__price strong {
  font-size: clamp(1.6rem, 2.4vw, 2.1rem);
  color: #15213b;
}

.aircraft-detail-modal__summary {
  margin: 0;
  white-space: pre-wrap;
  font: 600 1rem/1.65 "SFMono-Regular", "Menlo", "Monaco", monospace;
  color: #1f2c47;
  background: linear-gradient(180deg, rgba(245, 247, 252, 0.96), rgba(239, 242, 249, 0.96));
  border: 1px solid rgba(21, 33, 59, 0.08);
  border-radius: 1.1rem;
  padding: 1.1rem 1.2rem;
}

@media (max-width: 1180px) {
  .screen--results {
    width: 100%;
    margin-left: 0;
    margin-right: 0;
  }

  .results-body,
  .results-footer {
    grid-template-columns: 1fr;
  }

  .results-sidebar__card {
    position: static;
  }

  .results-benefits {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .aircraft-card-compact--refined {
    grid-template-columns: minmax(220px, 0.48fr) minmax(0, 0.52fr);
  }
}

@media (max-width: 900px) {
  .results-trust-bar,
  .results-hero,
  .results-toolbar {
    display: grid;
  }

  .results-trust-bar__pills {
    justify-content: flex-start;
  }

  .results-hero__edit,
  .results-toolbar__actions {
    justify-self: start;
  }

  .aircraft-list-compact--refined,
  .results-benefits {
    grid-template-columns: 1fr;
  }

  .aircraft-hero-card--editorial,
  .aircraft-card-compact--refined {
    grid-template-columns: 1fr;
  }

  .aircraft-hero-copy__header,
  .aircraft-card-head--refined {
    display: grid;
  }

  .aircraft-hero-copy__price,
  .aircraft-price-line--refined {
    justify-items: start;
    text-align: left;
  }
}

@media (max-width: 640px) {
  .results-hero,
  .filter-toolbar--results,
  .results-sidebar__card,
  .aircraft-hero-copy--editorial,
  .aircraft-copy--refined {
    padding: 1rem;
  }

  .aircraft-thumb-hero--single {
    height: 240px;
    min-height: 240px;
  }

  .aircraft-thumb--card {
    height: 200px;
    min-height: 200px;
  }

  .results-hero__copy h2 {
    font-size: 1.8rem;
  }

  .aircraft-detail-modal {
    padding: 1rem;
  }

  .aircraft-detail-modal__card {
    padding: 1.1rem;
    border-radius: 1.15rem;
  }

  .aircraft-detail-modal__header {
    flex-direction: column;
  }
}
</style>
