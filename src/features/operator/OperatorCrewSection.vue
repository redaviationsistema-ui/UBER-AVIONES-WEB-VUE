<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  crewForm: { type: Object, required: true },
  crewErrors: { type: Object, required: true },
  tripulation: { type: Array, required: true },
  crewRoles: { type: Array, required: true },
  crewStates: { type: Array, required: true },
  crewBases: { type: Array, required: true },
  editingCrewId: { type: [Number, String, null], default: null },
  savingCrew: { type: Boolean, default: false },
})

const activeTab = ref('Sobrecargo')
const tabs = ['Sobrecargo', 'Piloto', 'Copiloto', 'Coordinador']

const filteredPeople = computed(() =>
  props.tripulation.filter((item) => item.role === activeTab.value)
)

const roleCount = (role) =>
  props.tripulation.filter((item) => item.role === role).length

defineEmits(['update-field', 'create', 'select-person', 'suspend', 'reset-form'])
</script>

<template>
  <section class="crew-page">
    <div class="page-head surface">
      <div>
        <span class="eyebrow">Tripulación</span>
        <h3>Centro de tripulación operativa</h3>
        <p class="muted">
          Administra disponibilidad, certificaciones, bases, roles y rating del personal asignable.
        </p>
      </div>

      <button class="primary-action" type="button" :disabled="savingCrew" @click="$emit('create')">
        {{ editingCrewId ? 'Guardar cambios' : '+ Crear registro' }}
      </button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card surface">
        <span>Disponibles</span>
        <strong>{{ tripulation.filter(p => p.state === 'Disponible').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Descanso</span>
        <strong>{{ tripulation.filter(p => p.state === 'Descanso').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Suspendidos</span>
        <strong>{{ tripulation.filter(p => p.state === 'Suspendido').length }}</strong>
      </div>

      <div class="kpi-card surface">
        <span>Certificados</span>
        <strong>{{ tripulation.filter(p => p.certifications).length }}</strong>
      </div>
    </div>

    <div class="content-grid">
      <!-- DIRECTORIO -->
      <section class="surface list-card">
        <div class="section-head">
          <div>
            <h4>Directorio operativo</h4>
            <p class="muted">
              Consulta personal asignable por rol, estado y base operativa.
            </p>
          </div>
        </div>

        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab"
            type="button"
            class="tab-button"
            :class="{ active: activeTab === tab }"
            @click="activeTab = tab"
          >
            {{ tab }} {{ roleCount(tab) }}
          </button>
        </div>

        <div class="cards-grid">
          <article
            v-for="person in filteredPeople"
            :key="person.id"
            class="crew-card"
            :class="{
              'is-available': person.state === 'Disponible',
              'is-rest': person.state === 'Descanso',
              'is-suspended': person.state === 'Suspendido'
            }"
          >
            <span class="status-line"></span>

            <div class="crew-main">
              <div class="crew-top">
                <strong>{{ person.name }}</strong>
                <span class="badge">{{ person.state }}</span>
              </div>

              <span>{{ person.role }} · {{ person.base }}</span>

              <p>{{ person.certifications || 'Sin certificación registrada' }}</p>

              <small>
                {{ person.languages }} ·
                {{ person.availability }} ·
                Rating {{ person.rating }}
              </small>
              <div class="card-actions">
                <button type="button" class="ghost-button" @click="$emit('select-person', person)">
                  Editar
                </button>
                <button
                  type="button"
                  class="ghost-button ghost-button-danger"
                  :disabled="person.state === 'Suspendido'"
                  @click="$emit('suspend', person.id)"
                >
                  Suspender
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- PERFIL -->
      <section class="surface form-card">
        <div class="form-head">
          <h4>{{ editingCrewId ? 'Editar perfil operativo' : 'Perfil operativo' }}</h4>
          <p class="muted">
            Alta y control de personal operativo disponible para asignación.
          </p>
        </div>

        <div class="form-grid">
          <label>
            <span>Nombre</span>
            <input
              :value="crewForm.name"
              type="text"
              placeholder="Ana Lira"
              @input="$emit('update-field', { form: 'crew', field: 'name', value: $event.target.value })"
            />
            <small v-if="crewErrors.name">{{ crewErrors.name }}</small>
          </label>

          <label>
            <span>Rol</span>
            <select
              :value="crewForm.role"
              @change="$emit('update-field', { form: 'crew', field: 'role', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in crewRoles" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
            <small v-if="crewErrors.role">{{ crewErrors.role }}</small>
          </label>

          <label>
            <span>Teléfono</span>
            <input
              :value="crewForm.phone"
              type="text"
              placeholder="+52..."
              @input="$emit('update-field', { form: 'crew', field: 'phone', value: $event.target.value })"
            />
            <small v-if="crewErrors.phone">{{ crewErrors.phone }}</small>
          </label>

          <label>
            <span>Correo</span>
            <input
              :value="crewForm.email"
              type="email"
              placeholder="correo@empresa.com"
              @input="$emit('update-field', { form: 'crew', field: 'email', value: $event.target.value })"
            />
            <small v-if="crewErrors.email">{{ crewErrors.email }}</small>
          </label>

          <label>
            <span>Base</span>
            <select
              :value="crewForm.base"
              @change="$emit('update-field', { form: 'crew', field: 'base', value: $event.target.value })"
            >
              <option value="">Selecciona</option>
              <option v-for="item in crewBases" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
            <small v-if="crewErrors.base">{{ crewErrors.base }}</small>
          </label>

          <label>
            <span>Estado</span>
            <select
              :value="crewForm.state"
              @change="$emit('update-field', { form: 'crew', field: 'state', value: $event.target.value })"
            >
              <option v-for="item in crewStates" :key="item" :value="item">
                {{ item }}
              </option>
            </select>
          </label>

          <label>
            <span>Certificaciones</span>
            <input
              :value="crewForm.certifications"
              type="text"
              placeholder="Cabina ejecutiva / ATP / Seguridad"
              @input="$emit('update-field', { form: 'crew', field: 'certifications', value: $event.target.value })"
            />
            <small v-if="crewErrors.certifications">{{ crewErrors.certifications }}</small>
          </label>

          <label>
            <span>Idiomas</span>
            <input
              :value="crewForm.languages"
              type="text"
              placeholder="ES / EN"
              @input="$emit('update-field', { form: 'crew', field: 'languages', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Disponibilidad</span>
            <input
              :value="crewForm.availability"
              type="text"
              placeholder="Inmediata / 24 hrs"
              @input="$emit('update-field', { form: 'crew', field: 'availability', value: $event.target.value })"
            />
          </label>

          <label>
            <span>Rating</span>
            <input
              :value="crewForm.rating"
              type="text"
              placeholder="4.9/5"
              @input="$emit('update-field', { form: 'crew', field: 'rating', value: $event.target.value })"
            />
          </label>
        </div>
        <small v-if="crewErrors._form" class="form-error">{{ crewErrors._form }}</small>
        <div class="form-actions">
          <button
            type="button"
            class="primary-action"
            :disabled="savingCrew"
            @click="$emit('create')"
          >
            {{ savingCrew ? 'Guardando...' : editingCrewId ? 'Guardar cambios' : 'Crear registro' }}
          </button>
          <button
            v-if="editingCrewId"
            type="button"
            class="ghost-button"
            :disabled="savingCrew"
            @click="$emit('reset-form')"
          >
            Cancelar edicion
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.crew-page,
.content-grid,
.cards-grid {
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
.crew-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-head h3,
.form-card h4 {
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

.form-grid small {
  color: #b42318;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1rem;
}

.tab-button {
  min-height: 2.5rem;
  border: 1px solid #ddd6c7;
  border-radius: 999px;
  padding: 0 1rem;
  background: white;
  font-weight: 700;
  cursor: pointer;
}

.tab-button.active {
  color: #111;
  background: #f3ead2;
}

.cards-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.crew-card {
  display: grid;
  grid-template-columns: 5px 1fr;
  gap: 0.85rem;
  padding: 1rem;
  border-radius: 18px;
  background: #faf8f3;
  border: 1px solid rgba(201, 169, 107, 0.12);
}

.status-line {
  border-radius: 999px;
  background: #c8a96b;
}

.is-available .status-line {
  background: #16a34a;
}

.is-rest .status-line {
  background: #c8a96b;
}

.is-suspended .status-line {
  background: #b42318;
}

.crew-card p,
.crew-card small,
.crew-card span {
  margin: 0;
}

.crew-main {
  display: grid;
  gap: 0.35rem;
}

.card-actions,
.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.ghost-button-danger {
  color: #b42318;
  border-color: rgba(180, 35, 24, 0.16);
}

.form-error {
  display: block;
  margin-top: 0.85rem;
  color: #b42318;
}

@media (max-width: 1080px) {
  .content-grid,
  .form-grid,
  .cards-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .page-head {
    display: grid;
  }
}
</style>
