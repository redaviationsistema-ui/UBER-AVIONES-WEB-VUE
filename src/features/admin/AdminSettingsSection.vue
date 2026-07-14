<script setup>
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  settings: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
})

const emit = defineEmits(['save', 'refresh'])

const draftValues = reactive({})
const saveReason = reactive({ value: '' })

watch(
  () => props.settings,
  (records) => {
    Object.keys(draftValues).forEach((key) => delete draftValues[key])
    records.forEach((item) => {
      draftValues[item.key] = item.value ?? ''
    })
  },
  { immediate: true },
)

const groupedSettings = computed(() => {
  const catalog = new Map()

  props.settings.forEach((item) => {
    const group = String(item.group || 'general').trim() || 'general'
    if (!catalog.has(group)) {
      catalog.set(group, [])
    }

    catalog.get(group).push(item)
  })

  return [...catalog.entries()].map(([group, items]) => ({ group, items }))
})

const summaryCards = computed(() => [
  {
    label: 'Claves visibles',
    value: String(props.settings.length),
    detail: 'Solo se muestran configuraciones expuestas por Laravel.',
  },
  {
    label: 'Grupos',
    value: String(groupedSettings.value.length),
    detail: 'Agrupación operativa de parámetros configurables.',
  },
  {
    label: 'Cambios pendientes',
    value: String(
      props.settings.filter((item) => String(draftValues[item.key] ?? '') !== String(item.value ?? '')).length,
    ),
    detail: 'Diferencias locales antes de enviar al backend.',
  },
  {
    label: 'Motivo',
    value: saveReason.value.trim() ? 'Capturado' : 'Requerido',
    detail: 'Cada actualización administrativa exige motivo visible.',
  },
])

function submitChanges() {
  const changedSettings = props.settings
    .filter((item) => String(draftValues[item.key] ?? '') !== String(item.value ?? ''))
    .map((item) => ({
      key: item.key,
      value: draftValues[item.key],
      group: item.group || 'general',
    }))

  emit('save', {
    settings: changedSettings,
    reason: saveReason.value.trim(),
  })
}
</script>

<template>
  <div class="admin-settings-page">
    <section class="dashboard-hero">
      <div class="hero-center">
        <p class="eyebrow dark-eyebrow">Configuracion real</p>
        <h1>Parámetros administrativos conectados a Laravel.</h1>
        <p class="hero-subtitle">
          Esta vista deja fuera secretos y solo opera sobre claves que el backend ya expone como configurables.
        </p>
      </div>
    </section>

    <section class="status-strip">
      <article v-for="item in summaryCards" :key="item.label" class="signal-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <p>{{ item.detail }}</p>
      </article>
    </section>

    <section class="surface settings-shell">
      <header class="settings-toolbar">
        <textarea
          v-model="saveReason.value"
          rows="2"
          placeholder="Motivo obligatorio para guardar cambios administrativos"
        ></textarea>
        <div class="settings-toolbar__actions">
          <button type="button" class="ghost-button" :disabled="loading || saving" @click="emit('refresh')">
            {{ loading ? 'Actualizando...' : 'Actualizar' }}
          </button>
          <button
            type="button"
            class="primary-button"
            :disabled="saving || !saveReason.value.trim()"
            @click="submitChanges"
          >
            {{ saving ? 'Guardando...' : 'Guardar cambios' }}
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <div v-if="!groupedSettings.length && !loading" class="empty-state">
        <strong>Sin configuraciones expuestas.</strong>
        <p>Laravel todavía no devolvió claves configurables para este módulo.</p>
      </div>

      <div v-else class="settings-groups">
        <article v-for="group in groupedSettings" :key="group.group" class="surface settings-group">
          <div class="section-heading">
            <h2>{{ group.group }}</h2>
            <p>{{ group.items.length }} claves disponibles para este grupo.</p>
          </div>

          <div class="settings-grid">
            <label v-for="item in group.items" :key="item.key" class="field">
              <span>{{ item.key }}</span>
              <textarea
                v-if="String(item.value ?? '').length > 90"
                v-model="draftValues[item.key]"
                rows="3"
              ></textarea>
              <input v-else v-model="draftValues[item.key]" type="text" />
            </label>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-settings-page {
  min-height: 100vh;
}

.dashboard-hero,
.settings-shell {
  padding: 1.5rem clamp(1.25rem, 5vw, 4.5rem);
}

.dashboard-hero {
  min-height: 32vh;
  display: grid;
  background:
    radial-gradient(circle at top right, rgba(15, 76, 129, 0.12), transparent 20%),
    linear-gradient(180deg, #ffffff 0%, #f4f7fb 100%);
}

.hero-center {
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.9rem;
}

.hero-center h1,
.section-heading h2 {
  margin: 0;
  letter-spacing: -0.05em;
}

.hero-center h1 {
  max-width: 14ch;
  font-size: clamp(2.3rem, 6vw, 4rem);
  line-height: 0.98;
}

.hero-subtitle,
.section-heading p,
.signal-card p {
  color: #5d5d5d;
  line-height: 1.7;
}

.dark-eyebrow {
  color: #0f4c81;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
  padding: 0 clamp(1.25rem, 5vw, 4.5rem) 1.2rem;
  margin-top: -1.2rem;
}

.signal-card,
.settings-shell,
.settings-group {
  border: 1px solid #ebeff5;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.signal-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem 1.05rem;
}

.signal-card span {
  color: #64748b;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.signal-card strong {
  font-size: 1.7rem;
}

.settings-shell {
  margin: 0 clamp(1.25rem, 5vw, 4.5rem) 2rem;
  padding: 1.3rem;
}

.settings-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  margin-bottom: 1rem;
}

.settings-toolbar textarea,
.field textarea,
.field input {
  width: 100%;
  border: 1px solid #d8e0ea;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  font: inherit;
  resize: vertical;
}

.settings-toolbar__actions {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
}

.ghost-button,
.primary-button {
  border-radius: 999px;
  padding: 0.75rem 1rem;
  font: inherit;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid #d6dee8;
  background: #fff;
}

.primary-button {
  border: 1px solid #0f4c81;
  background: #0f4c81;
  color: #fff;
}

.ghost-button:disabled,
.primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-banner {
  margin: 0 0 1rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #fff1f2;
  color: #9f1239;
}

.settings-groups {
  display: grid;
  gap: 1rem;
}

.settings-group {
  padding: 1rem;
}

.section-heading {
  margin-bottom: 1rem;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.field {
  display: grid;
  gap: 0.45rem;
}

.field span {
  color: #334155;
  font-size: 0.85rem;
  font-weight: 700;
}

.empty-state {
  padding: 2rem 0;
  text-align: center;
}

@media (max-width: 960px) {
  .status-strip,
  .settings-grid,
  .settings-toolbar {
    grid-template-columns: 1fr;
  }

  .settings-toolbar__actions {
    justify-content: stretch;
    flex-direction: column;
  }
}
</style>
