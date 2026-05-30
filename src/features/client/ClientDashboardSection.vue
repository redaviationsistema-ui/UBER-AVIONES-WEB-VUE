<script setup>
import PanelClientePerfil from './perfil/PanelClientePerfil.vue'

defineProps({
  access: { type: Object, required: true },
  aircraft: { type: Array, required: true },
  activeOperation: { type: Object, default: null },
  clientDocuments: { type: Array, default: () => [] },
  commercialDocuments: { type: Array, default: () => [] },
  commercialEvents: { type: Array, default: () => [] },
  commercialProfile: { type: Object, default: () => ({}) },
  commercialStatus: { type: Object, default: () => ({}) },
  commercialTimeline: { type: Array, default: () => [] },
  conciergeChat: { type: Object, default: null },
  conciergeLoading: { type: Boolean, default: false },
  conciergeSending: { type: Boolean, default: false },
  latestRequest: { type: Object, default: null },
  metrics: { type: Object, required: true },
  documentStats: { type: Object, default: () => ({ total: 0, approved: 0, pending: 0, needsUpdate: 0 }) },
  loading: { type: Boolean, default: false },
  form: { type: Object, required: true },
  operationLoading: { type: Boolean, default: false },
  paymentSummary: { type: Object, default: () => ({}) },
  profile: { type: Object, default: () => ({}) },
  requests: { type: Array, default: () => [] },
  submitting: { type: Boolean, default: false },
  usingFallbackData: { type: Boolean, default: false },
})

const emit = defineEmits([
  'submit-request',
  'activate-access',
  'open-concierge',
  'review-aircraft',
  'send-concierge-message',
  'save-commercial-profile',
  'toggle-commercial-document',
  'trigger-commercial-action',
  'update-form',
  'update-commercial-field',
  'upload-client-document',
  'update-client-document-status',
  'remove-client-document',
  'download-client-document',
])
</script>

<template>
  <PanelClientePerfil
    v-bind="$props"
    @submit-request="emit('submit-request', $event)"
    @activate-access="emit('activate-access', $event)"
    @open-concierge="emit('open-concierge', $event)"
    @review-aircraft="emit('review-aircraft', $event)"
    @send-concierge-message="emit('send-concierge-message', $event)"
    @save-commercial-profile="emit('save-commercial-profile', $event)"
    @toggle-commercial-document="emit('toggle-commercial-document', $event)"
    @trigger-commercial-action="emit('trigger-commercial-action', $event)"
    @update-form="emit('update-form', $event)"
    @update-commercial-field="emit('update-commercial-field', $event)"
    @upload-client-document="emit('upload-client-document', $event)"
    @update-client-document-status="emit('update-client-document-status', $event)"
    @remove-client-document="emit('remove-client-document', $event)"
    @download-client-document="emit('download-client-document', $event)"
  />
</template>
