<script setup>
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import SiteFooter from '../components/SiteFooter.vue'
import { createClientFlightRequest } from '../features/client/clientBookingApi'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const ui = useUiStore()
const auth = useAuthStore()
const saving = ref(false)


const form = reactive({
  origin: 'Toluca / TLC',
  destination: 'Cancún / CUN',
  departureDate: '2026-05-02',
  returnDate: '2026-05-04',
  passengers: 6,
  aircraftType: 'Jet ejecutivo',
  program: 'Charter privado',
})



const aircraftOptions = [
  {
    code: 'RA-LJ01',
    category: 'Light Jet',
    eta: 'Disponible',
    range: 'Ruta nacional',
    status: 'Ideal para 4-6 pasajeros',
  },
  {
    code: 'RA-MJ24',
    category: 'Midsize Jet',
    eta: 'Premium',
    range: 'Ruta ejecutiva',
    status: 'Mayor confort y alcance',
  },
  {
    code: 'RA-LR77',
    category: 'Long Range',
    eta: 'Internacional',
    range: 'Larga distancia',
    status: 'Ideal para USA / LATAM',
  },
]

const selectedSummary = computed(() => {
  return `${form.origin} → ${form.destination} · ${form.passengers} pasajeros · ${form.aircraftType}`
})

function openAvailability() {
  router.push({
    name: 'login',
    query: {
      origin: form.origin,
      destination: form.destination,
      date: form.departureDate,
      passengers: String(form.passengers),
      aircraftType: form.aircraftType,
      program: form.program,
    },
  })
}
</script>

<template>
  <div class="aviation-page">

    <nav class="flight-tabs">
      <RouterLink to="/vuelos" class="flight-tab">Vuelos</RouterLink>
      <RouterLink to="/renta-aeronaves" class="flight-tab">Renta de aeronaves</RouterLink>
    </nav>

    <section class="booking-layout">
      <aside class="booking-card">
        <h1>Solicita un vuelo privado</h1>

        <div class="input-box">
          <span>●</span>
          <input v-model="form.origin" placeholder="Aeropuerto de salida" />
        </div>

        <div class="input-box">
          <span>■</span>
          <input v-model="form.destination" placeholder="Aeropuerto de destino" />
        </div>

        <div class="input-box">
          <span>◷</span>
          <input v-model="form.departureDate" type="date" />
        </div>

        <div class="input-box">
          <span>👤</span>
          <input v-model="form.passengers" type="number" min="1" />
        </div>

        <select v-model="form.aircraftType" class="select-box">
          <option>Jet ejecutivo</option>
          <option>Turbohélice</option>
          <option>Midsize Jet</option>
          <option>Long Range Jet</option>
        </select>

        <button class="primary-btn" @click="openAvailability">
          Buscar aeronaves
        </button>

        <p class="summary">{{ selectedSummary }}</p>
      </aside>

      <main class="map-area">
        <div class="reserve-pill">Reservas</div>

        <div class="map-card">
          <div class="grid-bg"></div>

          <div class="route route-one"></div>
          <div class="route route-two"></div>
          <div class="route route-three"></div>

          <div class="airport airport-a">TLC</div>
          <div class="airport airport-b">CUN</div>
          <div class="airport airport-c">MTY</div>
          <div class="airport airport-d">SJD</div>

          <div class="map-label">
            <strong>Mapa de cobertura aérea</strong>
            <span>México · LATAM · USA</span>
          </div>

          <div class="zoom-controls">
            <button>+</button>
            <button>−</button>
          </div>
        </div>

        <section class="aircraft-list">
          <article v-for="aircraft in aircraftOptions" :key="aircraft.code">
            <div>
              <strong>{{ aircraft.code }}</strong>
              <p>{{ aircraft.category }} · {{ aircraft.range }}</p>
            </div>

            <span>{{ aircraft.status }}</span>
          </article>
        </section>
      </main>
    </section>

    <SiteFooter />
  </div>
</template>

<style scoped>
.flight-tabs {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 4.5rem;
  border-bottom: 1px solid #eee;
}

.flight-tab {
  height: 64px;
  display: inline-flex;
  align-items: center;
  color: #000;
  font-size: .95rem;
  font-weight: 800;
  text-decoration: none;
  border-bottom: 4px solid transparent;
}

.flight-tab.router-link-active {
  border-bottom-color: #000;
}
.aviation-page {
  min-height: 100vh;
  background: #ffffff;
  color: #000;
}

.top-tabs {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 4.5rem;
  border-bottom: 1px solid #eee;
}

.tab-button {
  height: 64px;
  border: 0;
  background: transparent;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  border-bottom: 4px solid transparent;
}

.tab-button.active {
  border-bottom-color: #000;
}

.booking-layout {
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 2.4rem;
  padding: 2rem 4.5rem;
}

.booking-card {
  padding: 1.1rem;
  border: 1px solid #eee;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.02);
}

.booking-card h1 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
  line-height: 1.25;
}

.input-box,
.select-box {
  width: 100%;
  min-height: 48px;
  margin-bottom: 0.75rem;
  border: 0;
  border-radius: 8px;
  background: #f2f2f2;
}

.input-box {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0 1rem;
}

.input-box span {
  font-size: 0.85rem;
  font-weight: 900;
}

.input-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  font-size: 0.95rem;
}

.select-box {
  padding: 0 1rem;
  font-weight: 700;
}

.pill-btn {
  margin-bottom: 0.75rem;
  padding: 0.7rem 1rem;
  border: 0;
  border-radius: 999px;
  font-weight: 800;
  background: #f1f1f1;
}

.primary-btn {
  width: 100%;
  min-height: 48px;
  margin-top: 0.4rem;
  border: 0;
  border-radius: 8px;
  background: #000;
  color: #fff;
  font-weight: 900;
  cursor: pointer;
}

.summary {
  margin: 1rem 0 0;
  color: #666;
  font-size: 0.85rem;
  line-height: 1.5;
}

.map-area {
  position: relative;
}

.reserve-pill {
  position: absolute;
  top: 0;
  right: 1rem;
  z-index: 5;
  padding: 0.85rem 1.3rem;
  border-radius: 999px;
  background: #eee;
  font-weight: 900;
}

.map-card {
  position: relative;
  height: 510px;
  margin-top: 0;
  overflow: hidden;
  border-radius: 12px;
  background: #edf1f5;
}

.grid-bg {
  position: absolute;
  inset: 0;
  opacity: 0.9;
  background-image:
    linear-gradient(rgba(120, 140, 170, 0.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 140, 170, 0.18) 1px, transparent 1px);
  background-size: 38px 38px;
}

.route {
  position: absolute;
  height: 5px;
  border-radius: 999px;
  background: rgba(40, 69, 130, 0.55);
}

.route-one {
  width: 55%;
  top: 28%;
  left: 12%;
  transform: rotate(24deg);
}

.route-two {
  width: 45%;
  top: 55%;
  left: 38%;
  transform: rotate(-18deg);
}

.route-three {
  width: 38%;
  top: 42%;
  left: 18%;
  transform: rotate(-52deg);
}

.airport {
  position: absolute;
  width: 54px;
  height: 54px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #000;
  color: #fff;
  font-weight: 900;
  box-shadow: 0 14px 30px rgba(0,0,0,.2);
}

.airport-a {
  top: 22%;
  left: 16%;
}

.airport-b {
  top: 58%;
  right: 18%;
}

.airport-c {
  top: 34%;
  left: 48%;
}

.airport-d {
  bottom: 14%;
  left: 32%;
}

.map-label {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: rgba(255,255,255,.88);
}

.map-label span {
  color: #555;
  font-size: 0.85rem;
}

.zoom-controls {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  overflow: hidden;
  border-radius: 10px;
  background: #fff;
}

.zoom-controls button {
  display: block;
  width: 42px;
  height: 42px;
  border: 0;
  background: #fff;
  font-size: 1.5rem;
  cursor: pointer;
}

.aircraft-list {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.aircraft-list article {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #eee;
  border-radius: 14px;
}

.aircraft-list p {
  margin: 0.2rem 0 0;
  color: #666;
}

.aircraft-list span {
  font-size: 0.85rem;
  font-weight: 800;
}

.membership-card {
  margin-bottom: 0.75rem;
  padding: 1rem;
  border-radius: 12px;
  background: #f3f3f3;
}

.membership-card p {
  margin: 0.35rem 0 0;
  color: #555;
  line-height: 1.4;
}

.membership-card.featured {
  background: #000;
  color: #fff;
}

.membership-card.featured p {
  color: rgba(255,255,255,.75);
}

@media (max-width: 980px) {
  .top-tabs {
    padding: 0 1rem;
    overflow-x: auto;
  }

  .booking-layout {
    grid-template-columns: 1fr;
    padding: 1rem;
  }

  .map-card {
    height: 420px;
  }
}
</style>
