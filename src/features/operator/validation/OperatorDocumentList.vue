<script setup>
import { computed, ref } from 'vue'
import OperatorDocumentRow from './OperatorDocumentRow.vue'

const props = defineProps({
  documents: { type: Array, default: () => [] },
  role: { type: String, default: 'provider' },
  loadingStateByKey: { type: Object, default: () => ({}) },
  title: { type: String, default: 'Documentacion legal' },
  subtitle: { type: String, default: 'Expediente documental actual' },
})

const emit = defineEmits(['view', 'download', 'approve', 'reject', 'cancel', 'replace'])
const expanded = ref(true)

const sortedDocuments = computed(() =>
  [...props.documents].sort((left, right) => {
    if (left.sectionKey !== right.sectionKey) return String(left.sectionKey || '').localeCompare(String(right.sectionKey || ''))
    return String(left.definitionLabel || '').localeCompare(String(right.definitionLabel || ''))
  }),
)

function getLoadingState(document, action) {
  return Boolean(props.loadingStateByKey?.[`${document?.id}:${action}`])
}
</script>

<template>
  <section class="operator-document-list">
    <header class="operator-document-list__head">
      <div>
        <p class="operator-document-list__eyebrow">Documentos</p>
        <h3>{{ title }}</h3>
        <p>{{ subtitle }}</p>
      </div>
      <button type="button" class="ghost-button" @click="expanded = !expanded">
        {{ expanded ? 'Ocultar' : 'Mostrar' }}
      </button>
    </header>

    <div v-if="expanded" class="operator-document-list__body">
      <OperatorDocumentRow
        v-for="document in sortedDocuments"
        :key="document.id || document.definitionKey"
        :document="document"
        :role="role"
        :approving="getLoadingState(document, 'approve')"
        :rejecting="getLoadingState(document, 'reject')"
        :cancelling="getLoadingState(document, 'cancel')"
        @view="emit('view', $event)"
        @download="emit('download', $event)"
        @approve="emit('approve', $event)"
        @reject="emit('reject', $event)"
        @cancel="emit('cancel', $event)"
        @replace="emit('replace', $event)"
      />

      <p v-if="!sortedDocuments.length" class="operator-document-list__empty">
        No hay documentos visibles en el expediente actual.
      </p>
    </div>
  </section>
</template>

<style scoped>
.operator-document-list {
  display: grid;
  gap: 18px;
}

.operator-document-list__head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-start;
}

.operator-document-list__eyebrow {
  margin: 0 0 6px;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #5f87c7;
}

.operator-document-list__head h3 {
  margin: 0;
  color: #15324d;
}

.operator-document-list__head p {
  margin: 8px 0 0;
  color: #6f8096;
}

.operator-document-list__body {
  display: grid;
  gap: 12px;
}

.operator-document-list__empty {
  margin: 0;
  padding: 18px;
  border: 1px dashed rgba(21, 50, 77, 0.16);
  border-radius: 18px;
  color: #6f8096;
}

.ghost-button {
  border: 1px solid rgba(21, 50, 77, 0.12);
  background: rgba(255, 255, 255, 0.95);
  color: #15324d;
  border-radius: 999px;
  padding: 10px 14px;
}
</style>
