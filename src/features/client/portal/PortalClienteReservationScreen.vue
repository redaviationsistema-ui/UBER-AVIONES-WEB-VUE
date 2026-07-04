<script setup>
import FlightSearchHero from '../FlightSearchHero.vue'

defineProps({
  activeItinerarySummary: { type: Object, default: () => ({}) },
  activeResultFilter: { type: String, required: true },
  aircraftBillingNote: { type: Function, required: true },
  aircraftCapacityLabel: { type: Function, required: true },
  aircraftClassLabel: { type: Function, required: true },
  aircraftIncludes: { type: Function, required: true },
  aircraftPriceCopy: { type: Function, required: true },
  aircraftSpeedLine: { type: Function, required: true },
  aircraftVisualStyle: { type: Function, required: true },
  commercialAccessCtaLabel: { type: String, required: true },
  commercialTrialNotice: { type: Object, required: true },
  featuredAircraft: { type: Object, default: null },
  isResultsSection: { type: Boolean, required: true },
  itineraryHeadline: { type: Function, required: true },
  itinerarySummary: { type: Object, default: () => ({}) },
  itineraryDateLine: { type: Function, required: true },
  reservationActionLabel: { type: Function, required: true },
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
  'go-commercial-access-payment',
  'remove-leg',
  'request-reservation',
  'select-form-airport',
  'select-leg-airport',
  'submit-search',
  'update:active-result-filter',
  'update-leg-field',
  'update-form-field',
  'update-trip-type',
])

function resultRankLabel(index = 0) {
  if (index === 0) return 'Seleccion curada'
  if (index === 1) return 'Alternativa agil'
  if (index === 2) return 'Balance ejecutivo'
  return 'Opcion privada'
}

function aircraftFactChips(aircraft, itinerary, helpers) {
  return [
    helpers.aircraftClassLabel(aircraft),
    helpers.aircraftCapacityLabel(aircraft),
    helpers.aircraftSpeedLine(aircraft, itinerary),
  ].filter(Boolean)
}

function aircraftIsAvailable(aircraft) {
  return aircraft?.is_available !== false
}
</script>

<template>
  <section v-if="!isResultsSection" class="screen">
    <article
      class="commercial-access-banner"
      :class="`commercial-access-banner--${commercialTrialNotice.tone}`"
    >
      <strong>{{ commercialTrialNotice.title }}</strong>
      <p>{{ commercialTrialNotice.message }}</p>
      <button
        v-if="shouldShowCommercialAccessCta"
        type="button"
        class="commercial-access-banner__action"
        @click="$emit('go-commercial-access-payment')"
      >
        {{ commercialAccessCtaLabel }}
      </button>
    </article>

    <FlightSearchHero
      :form="searchForm"
      :summary="itinerarySummary"
      :trip-type="tripType"
      @add-leg="$emit('add-leg')"
      @remove-leg="$emit('remove-leg', $event)"
      @submit="$emit('submit-search')"
      @select-form-airport="$emit('select-form-airport', $event)"
      @select-leg-airport="$emit('select-leg-airport', $event)"
      @update-form-field="$emit('update-form-field', $event)"
      @update-leg-field="$emit('update-leg-field', $event)"
      @update-trip-type="$emit('update-trip-type', $event)"
    />
  </section>

  <section v-else class="screen">
    <article
      class="commercial-access-banner"
      :class="`commercial-access-banner--${commercialTrialNotice.tone}`"
    >
      <strong>{{ commercialTrialNotice.title }}</strong>
      <p>{{ commercialTrialNotice.message }}</p>
      <button
        v-if="shouldShowCommercialAccessCta"
        type="button"
        class="commercial-access-banner__action"
        @click="$emit('go-commercial-access-payment')"
      >
        {{ commercialAccessCtaLabel }}
      </button>
    </article>

    <div class="results-shell">
      <header class="results-hero">
        <div class="results-hero__copy">
          <span class="results-hero__eyebrow">Sky Group curated shortlist</span>
          <h2>{{ itineraryHeadline(activeItinerarySummary) }}</h2>
          <p class="results-hero__date">{{ itineraryDateLine(activeItinerarySummary) }}</p>
         
        </div>

    
      </header>

      <div class="filter-toolbar filter-toolbar--results">
        <div class="filter-toolbar__copy">
        </div>
        <div class="filter-row filter-row--pills">
          <button
            v-for="filter in resultFilterOptions"
            :key="filter.key"
            :aria-pressed="activeResultFilter === filter.key"
            :class="{ 'active-filter': activeResultFilter === filter.key }"
            type="button"
            @click="$emit('update:active-result-filter', filter.key)"
          >
            <strong>{{ filter.label }}</strong>
          </button>
        </div>
      </div>

      <div v-if="searching" class="loading-band">Haciendo match con operadores activos...</div>
      <div v-else-if="serverSearchError" class="empty-state">{{ serverSearchError }}</div>

      <article
        v-if="featuredAircraft"
        class="aircraft-hero-card aircraft-hero-card--editorial"
        :class="{ 'aircraft-card--unavailable': !aircraftIsAvailable(featuredAircraft) }"
      >
        <div
          class="aircraft-thumb aircraft-thumb-hero aircraft-thumb-hero--single"
          :class="{ 'aircraft-thumb--placeholder': !featuredAircraft.image_url }"
          :style="aircraftVisualStyle(featuredAircraft.image_url)"
        >
          <img
            v-if="featuredAircraft.image_url"
            :src="featuredAircraft.image_url"
            :alt="featuredAircraft.aircraft"
            loading="lazy"
          />
          <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
          <div class="aircraft-thumb__overlay">
            <span class="aircraft-thumb__badge">{{ aircraftClassLabel(featuredAircraft) }}</span>
            <span class="aircraft-thumb__rank">{{ resultRankLabel(0) }}</span>
          </div>
        </div>

        <div class="aircraft-hero-copy aircraft-hero-copy--editorial">
          <div class="aircraft-hero-copy__header">
            <div>
              <span class="eyebrow">Recomendado por asesor</span>
              <h3>{{ featuredAircraft.aircraft }}</h3>
            </div>
            <div class="aircraft-hero-copy__price">
              <span>Tarifa estimada total</span>
              <strong class="hero-price">{{ aircraftPriceCopy(featuredAircraft) }}</strong>
            </div>
          </div>

          <div class="aircraft-hero-chips">
            <span
              v-for="item in aircraftFactChips(featuredAircraft, activeItinerarySummary, {
                aircraftClassLabel,
                aircraftCapacityLabel,
                aircraftSpeedLine,
              })"
              :key="item"
            >
              {{ item }}
            </span>
          </div>

          <p class="hero-service-copy">
            Experiencia priorizada para decidir rapido: una foto principal, lectura inmediata del
            precio y beneficios visibles en un solo bloque.
          </p>

          <p v-if="aircraftBillingNote(featuredAircraft)" class="aircraft-billing-note">
            {{ aircraftBillingNote(featuredAircraft) }}
          </p>
          <p v-if="!aircraftIsAvailable(featuredAircraft)" class="aircraft-unavailable-note">
            Aeronave no disponible para este horario
          </p>

          <div class="hero-includes hero-includes--editorial">
            <span v-for="item in aircraftIncludes(featuredAircraft)" :key="item">{{ item }}</span>
          </div>

          <div class="hero-actions hero-actions--editorial">
            <button
              type="button"
              :disabled="Boolean(reservingAircraftId) || !aircraftIsAvailable(featuredAircraft)"
              @click="$emit('request-reservation', featuredAircraft)"
            >
              {{ reservationActionLabel(featuredAircraft) }}
            </button>
          </div>
        </div>
      </article>

      <section v-if="secondaryAircraftOptions.length" class="results-section">
        <div class="results-section__head">
          <div>
            <span class="eyebrow">Alternativas privadas</span>
            <h3>Opciones comparables con menos ruido visual</h3>
          </div>
        </div>

        <div class="aircraft-list aircraft-list-compact aircraft-list-compact--refined">
          <article
            v-for="(aircraft, index) in secondaryAircraftOptions"
            :key="aircraft.id"
            class="aircraft-card aircraft-card-compact aircraft-card-compact--refined"
            :class="{ 'aircraft-card--unavailable': !aircraftIsAvailable(aircraft) }"
          >
            <div
              class="aircraft-thumb aircraft-thumb--card"
              :class="{ 'aircraft-thumb--placeholder': !aircraft.image_url }"
              :style="aircraftVisualStyle(aircraft.image_url)"
            >
              <img
                v-if="aircraft.image_url"
                :src="aircraft.image_url"
                :alt="aircraft.aircraft"
                loading="lazy"
              />
              <span v-else class="aircraft-thumb__empty">Imagen en validación</span>
              <div class="aircraft-thumb__overlay">
                <span class="aircraft-thumb__badge">{{ aircraftClassLabel(aircraft) }}</span>
                <span class="aircraft-thumb__rank">{{ resultRankLabel(index + 1) }}</span>
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
                  <strong>{{ aircraftPriceCopy(aircraft) }}</strong>
                </div>
              </div>

              <div class="aircraft-quick-meta aircraft-quick-meta--refined">
                <span
                  v-for="item in aircraftFactChips(aircraft, activeItinerarySummary, {
                    aircraftClassLabel,
                    aircraftCapacityLabel,
                    aircraftSpeedLine,
                  })"
                  :key="item"
                >
                  {{ item }}
                </span>
              </div>
              <p v-if="aircraftBillingNote(aircraft)" class="aircraft-billing-note">
                {{ aircraftBillingNote(aircraft) }}
              </p>
              <p v-if="!aircraftIsAvailable(aircraft)" class="aircraft-unavailable-note">
                Aeronave no disponible para este horario
              </p>
              <div class="card-actions card-actions--refined">
                <button
                  type="button"
                  :disabled="Boolean(reservingAircraftId) || !aircraftIsAvailable(aircraft)"
                  @click="$emit('request-reservation', aircraft)"
                >
                  {{ reservationActionLabel(aircraft) }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.results-shell {
  display: grid;
  gap: 1.5rem;
  width: 100%;
  max-width: 1200px;
  min-width: 0;
  margin: 0 auto;
  overflow-x: hidden;
}

.results-shell *,
.results-hero,
.results-hero__copy,
.results-hero__panel,
.results-section,
.results-section__head,
.aircraft-hero-card--editorial,
.aircraft-card-compact--refined,
.aircraft-copy--refined,
.aircraft-card-head--refined,
.aircraft-card-head__copy,
.aircraft-hero-copy--editorial,
.aircraft-hero-copy__header,
.aircraft-hero-copy__price,
.aircraft-price-line--refined {
  min-width: 0;
}

.results-hero__copy,
.results-hero__headline,
.results-hero__subcopy,
.results-hero__date,
.results-section__head p,
.hero-service-copy,
.aircraft-billing-note,
.aircraft-card-head--refined h3,
.aircraft-hero-copy__header h3,
.aircraft-price-line--refined strong,
.aircraft-hero-copy__price strong {
  overflow-wrap: anywhere;
  white-space: normal;
}

.results-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  gap: 1.25rem;
  padding: 1.5rem;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  background:
    radial-gradient(circle at top left, rgba(120, 119, 198, 0.08), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 249, 252, 0.96));
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
}

.results-hero__copy {
  display: grid;
  gap: 0.7rem;
}

.results-hero__eyebrow {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.results-hero__copy h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(2rem, 3vw, 3.2rem);
  line-height: 1.02;
  letter-spacing: -0.05em;
}

.results-hero__date,
.results-hero__subcopy {
  margin: 0;
  color: #475569;
}

.results-hero__headline {
  color: #111827;
  font-size: 1.02rem;
  line-height: 1.55;
}

.results-hero__panel {
  display: grid;
  gap: 1rem;
  align-content: start;
  padding: 1.2rem;
  border-radius: 24px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(241, 245, 249, 0.92));
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.results-hero__panel-label {
  color: #0f172a;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.results-hero__panel-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.results-hero__panel-grid article {
  display: grid;
  gap: 0.25rem;
  padding: 0.9rem;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.18);
}

.results-hero__panel-grid strong {
  color: #111827;
  font-size: 1.1rem;
}

.results-hero__panel-grid span,
.results-hero__panel p {
  color: #64748b;
  font-size: 0.9rem;
  line-height: 1.5;
  margin: 0;
}

.filter-toolbar--results {
  display: grid;
  gap: 0.85rem;
  width: 100%;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.06);
  padding: 1rem 1.15rem;
}

.filter-toolbar__copy {
  display: grid;
  gap: 0.3rem;
}

.filter-toolbar__copy span {
  color: #64748b;
  font-size: 0.88rem;
}

.filter-toolbar__copy strong {
  color: #0f172a;
  font-size: 0.98rem;
  line-height: 1.45;
}

.filter-row--pills {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
}

.filter-row--pills button {
  min-height: 44px;
  max-width: 100%;
  padding: 0.7rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  background: #ffffff;
  color: #111827;
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 1.2;
}

.filter-row--pills button.active-filter {
  background: #111827;
  color: #ffffff;
}

.aircraft-hero-card--editorial {
  display: grid;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
  padding: 0 !important;
  min-height: auto !important;
  overflow: hidden;
  border-radius: 30px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98));
  box-shadow: 0 26px 80px rgba(15, 23, 42, 0.09);
}

.aircraft-thumb {
  position: relative;
  overflow: hidden;
  display: block;
  width: 100%;
  min-width: 0;
  background:
    radial-gradient(circle at top right, rgba(255, 255, 255, 0.2), transparent 28%),
    linear-gradient(135deg, #dbe4f0, #eef2f7);
}

.aircraft-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.aircraft-thumb-hero--single {
  height: 420px;
  min-height: 420px;
  width: 100%;
  border-radius: 0;
}

.aircraft-thumb--card {
  height: 240px;
  min-height: 240px;
  width: 100%;
  border-radius: 0;
}

.aircraft-thumb__overlay {
  position: absolute;
  inset: 1rem 1rem auto 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  z-index: 2;
}

.aircraft-thumb__rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(14px);
  color: #111827;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.aircraft-hero-copy--editorial {
  display: grid;
  gap: 1rem;
  padding: 1.45rem 1.45rem 1.6rem;
}

.aircraft-hero-copy__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.aircraft-hero-copy__header h3 {
  margin: 0.3rem 0 0;
  color: #0f172a;
  font-size: clamp(1.5rem, 2.2vw, 2.3rem);
  letter-spacing: -0.04em;
}

.aircraft-hero-copy__price {
  display: grid;
  gap: 0.2rem;
  justify-items: end;
  text-align: right;
}

.aircraft-hero-copy__price span {
  color: #64748b;
  font-size: 0.86rem;
}

.aircraft-hero-copy__price strong,
.aircraft-price-line--refined strong {
  text-align: right;
}

.aircraft-hero-chips,
.aircraft-quick-meta--refined {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.aircraft-hero-chips span,
.aircraft-quick-meta--refined span {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(148, 163, 184, 0.16);
  color: #0f172a;
  font-size: 0.88rem;
  font-weight: 600;
}

.hero-includes--editorial {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.hero-includes--editorial span {
  background: #eef2ff;
  color: #312e81;
}

.hero-actions--editorial {
  display: flex;
  justify-content: flex-start;
}

.hero-actions--editorial button,
.card-actions--refined button {
  min-height: 48px;
  padding: 0.85rem 1.2rem;
  border: 0;
  border-radius: 16px;
  background: linear-gradient(135deg, #111827, #2563eb);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 14px 30px rgba(37, 99, 235, 0.22);
}

.hero-actions--editorial button:disabled,
.card-actions--refined button:disabled {
  cursor: not-allowed;
  background: linear-gradient(135deg, #94a3b8, #cbd5e1);
  box-shadow: none;
}

.results-section {
  display: grid;
  gap: 1rem;
}

.results-section__head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.results-section__head h3 {
  margin: 0.3rem 0 0;
  color: #0f172a;
  font-size: 1.45rem;
  letter-spacing: -0.03em;
}

.results-section__head p {
  max-width: 420px;
  margin: 0;
  color: #64748b;
}

.aircraft-list-compact--refined {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.2rem;
  width: 100%;
}

.aircraft-card-compact--refined {
  display: grid;
  grid-template-columns: 1fr !important;
  gap: 0 !important;
  padding: 0 !important;
  min-height: auto !important;
  overflow: hidden;
  border-radius: 26px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.07);
}

.aircraft-card--unavailable {
  opacity: 0.78;
}

.aircraft-copy--refined {
  display: grid;
  gap: 0.9rem;
  padding: 1.2rem;
}

.aircraft-card-head--refined {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.aircraft-card-head--refined h3 {
  margin: 0.25rem 0 0;
  color: #111827;
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}

.aircraft-price-line--refined {
  display: grid;
  gap: 0.25rem;
  justify-items: end;
  text-align: right;
  min-width: 0;
}

.card-actions--refined {
  display: flex;
  justify-content: flex-start;
}

.aircraft-unavailable-note {
  margin: 0;
  color: #b91c1c;
  font-size: 0.92rem;
  font-weight: 700;
}

.aircraft-card-compact--refined .card-actions--refined button,
.aircraft-hero-card--editorial .hero-actions--editorial button {
  min-width: 0;
  width: auto;
  max-width: 100%;
}

@media (max-width: 980px) {
  .results-hero,
  .results-section__head,
  .aircraft-card-head--refined,
  .aircraft-hero-copy__header {
    grid-template-columns: 1fr;
    display: grid;
  }

  .results-hero__panel-grid,
  .aircraft-list-compact--refined {
    grid-template-columns: 1fr;
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
  .aircraft-hero-copy--editorial,
  .aircraft-copy--refined {
    padding: 1rem;
  }

  .aircraft-thumb-hero--single {
    height: 280px;
    min-height: 280px;
  }

  .aircraft-thumb--card {
    height: 220px;
    min-height: 220px;
  }

  .results-hero__copy h2 {
    font-size: 1.8rem;
  }

  .aircraft-hero-copy__price,
  .aircraft-price-line--refined,
  .aircraft-hero-copy__price strong,
  .aircraft-price-line--refined strong {
    justify-items: start;
    text-align: left;
  }
}

@media (min-width: 1100px) {
  .aircraft-list-compact--refined {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
