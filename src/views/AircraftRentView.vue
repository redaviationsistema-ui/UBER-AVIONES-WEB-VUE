<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import SiteFooter from '../components/SiteFooter.vue'

const router = useRouter()

const form = reactive({
  pickup: 'Toluca / TLC',
  departureDate: '2026-05-02',
  returnDate: '2026-05-04',
  aircraftType: 'Jet ejecutivo',
})

const rentalFleet = [
  {
    code: 'RA-RJ10',
    category: 'Jet ejecutivo',
    availability: 'Disponible hoy',
    status: 'Ideal corporativo',
  },
  {
    code: 'RA-HT22',
    category: 'Helicóptero',
    availability: 'Disponible',
    status: 'Traslado rápido',
  },
  {
    code: 'RA-LR90',
    category: 'Long Range',
    availability: 'Reserva premium',
    status: 'Internacional',
  },
]

function searchRental() {
  router.push({
    name: 'login',
    query: {
      pickup: form.pickup,
      departureDate: form.departureDate,
      returnDate: form.returnDate,
      aircraftType: form.aircraftType,
    },
  })
}
</script>

<template>
  <div class="aviation-page">
    <nav class="flight-tabs">
      <RouterLink to="/vuelos" class="flight-tab">Vuelos</RouterLink>
      <RouterLink to="/renta-aeronaves" class="flight-tab">Renta de aeronaves</RouterLink>
      <RouterLink to="/membresias" class="flight-tab">Membresías</RouterLink>
    </nav>

    <section class="booking-layout">
      <aside class="booking-card">
        <h1>Encuentra aeronaves disponibles</h1>

        <button class="pill-btn">Punto de devolución diferente</button>

        <select v-model="form.aircraftType" class="select-box">
          <option>Jet ejecutivo</option>
          <option>Turbohélice</option>
          <option>Helicóptero</option>
          <option>Long Range Jet</option>
        </select>

        <div class="input-box">
          <span>●</span>
          <input v-model="form.pickup" placeholder="Punto de recolección" />
        </div>

        <div class="input-box">
          <span>📅</span>
          <input v-model="form.departureDate" type="date" />
        </div>

        <div class="input-box">
          <span>↩</span>
          <input v-model="form.returnDate" type="date" />
        </div>

        <button class="primary-btn" @click="searchRental">
          Buscar disponibilidad
        </button>
      </aside>

      <main class="map-area">
        <div class="reserve-pill">Reservas</div>

        <div class="map-card">
          <div class="grid-bg"></div>
          <div class="airport airport-a">TLC</div>
          <div class="airport airport-b">CUN</div>
          <div class="airport airport-c">MTY</div>

          <div class="map-label">
            <strong>Mapa de renta aérea</strong>
            <span>Disponibilidad estratégica</span>
          </div>
        </div>

        <section class="aircraft-list">
          <article v-for="aircraft in rentalFleet" :key="aircraft.code">
            <div>
              <strong>{{ aircraft.code }}</strong>
              <p>{{ aircraft.category }} · {{ aircraft.availability }}</p>
            </div>

            <span>{{ aircraft.status }}</span>
          </article>
        </section>
      </main>
    </section>

    <SiteFooter />
  </div>
</template>