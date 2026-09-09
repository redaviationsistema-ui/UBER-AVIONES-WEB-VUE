/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CrewWorkflowAction from '../features/crew/CrewWorkflowAction.vue'
import { applyCanonicalCrewWorkflow, crewMilestoneAction } from '../features/crew/crewCanonicalWorkflow'
import { buildCrewOperationWorkflowSnapshot } from '../features/operations/utils/crewOperationWorkflow'

const group = (type, completed = false) => ({ type, items: [{ id: type, status: completed ? 'completed' : 'pending', is_required: true }] })
const workflow = (overrides = {}) => ({
  operation_id: 1, assignment_id: 2, assignment_status: 'confirmed', crew_status: 'ready_for_operation',
  timeline: [], checklists: [group('preparation', true), group('preflight'), group('postflight')],
  allowed_actions: [{ type: 'crew_checkin', label: 'Registrar llegada' }], ...overrides,
})
const normalized = (payload) => applyCanonicalCrewWorkflow({ id: 1, operationId: 1, assignment: { id: 2 } }, payload)

describe('canonical crew workflow', () => {
  it('renders the backend primary action and an independent secondary incident button', async () => {
    const action = workflow().allowed_actions[0]
    const wrapper = mount(CrewWorkflowAction, { props: { action } })
    expect(wrapper.get('.primary-action').text()).toBe('Registrar llegada')
    expect(wrapper.get('.ghost-button').text()).toBe('Reportar incidencia')
    await wrapper.get('.primary-action').trigger('click')
    expect(wrapper.emitted('execute')[0]).toEqual([action])
    await wrapper.get('.ghost-button').trigger('click')
    expect(wrapper.emitted('incident')).toHaveLength(1)
  })
  it('shows the backend blocking reason without inventing an action', () => {
    const reason = 'Registra primero tu llegada al aeropuerto.'
    const wrapper = mount(CrewWorkflowAction, { props: { blockedReason: reason } })
    expect(wrapper.get('[role="status"]').text()).toBe(reason)
    expect(wrapper.find('.primary-action').exists()).toBe(false)
    expect(wrapper.get('.ghost-button').text()).toBe('Reportar incidencia')
  })
  it('replaces stale permissions using allowed_actions even when local flags disagree', () => {
    const old = { id: 1, canCheckin: true, canReceivePassengers: false, workflowStatus: 'ready_for_operation' }
    const result = applyCanonicalCrewWorkflow(old, workflow({ crew_status: 'boarding', allowed_actions: [{ type: 'passengers_ready', label: 'Confirmar pasajeros a bordo' }] }))
    expect(result.canCheckin).toBe(false)
    expect(result.canReceivePassengers).toBe(true)
    expect(crewMilestoneAction(result.allowedActions, 'passengers_on_board')?.label).toBe('Confirmar pasajeros a bordo')
    expect(applyCanonicalCrewWorkflow(old, {}).canCheckin).toBe(false)
  })
  it('places arrival before preflight and records time and responsible user after checkin', () => {
    const before = buildCrewOperationWorkflowSnapshot(normalized(workflow()))
    expect(before.workflow.currentId).toBe('arrival')
    expect(before.workflow.stepsById.get('checklist').blocked).toBe(true)
    const after = buildCrewOperationWorkflowSnapshot(normalized(workflow({
      crew_status: 'checked_in', allowed_actions: [{ type: 'start_preflight', label: 'Iniciar checklist pre-vuelo' }],
      checkin: { recorded_at: '2026-09-07T10:00:00Z', actor_name: 'Tripulante de prueba' },
    })))
    expect(after.workflow.currentId).toBe('checklist')
    expect(after.tracking.items.find((e) => e.code === 'airport_arrival')).toMatchObject({ status: 'completed', timestamp: '2026-09-07T10:00:00Z', actorName: 'Tripulante de prueba' })
  })
  it('requires actual combined cabin/catering evidence, not cabin_ready status', () => {
    const entity = normalized(workflow({ crew_status: 'cabin_ready', timeline: [{ status: 'cabin_ready', created_at: '2026-09-07T10:00:00Z' }] }))
    expect(buildCrewOperationWorkflowSnapshot(entity).tracking.items.find((e) => e.code === 'aircraft_ready').status).not.toBe('completed')
    entity.timeline.push({ status: 'cabina_lista', created_at: '2026-09-07T10:01:00Z' })
    const items = buildCrewOperationWorkflowSnapshot(entity).tracking.items
    expect(items.find((e) => e.code === 'aircraft_ready').status).toBe('completed')
    expect(items.some((e) => e.code === 'catering_received')).toBe(false)
  })
  it('keeps explicitly recoverable actions even with historical inconsistencies', () => {
    const entity = normalized(workflow({ workflow_inconsistent: true, recoverable: true, blocking_reason: null }))
    expect(entity.canCheckin).toBe(true)
    expect(entity.allowedActions[0].type).toBe('crew_checkin')
    expect(buildCrewOperationWorkflowSnapshot(entity).blockingReason).toBe('')
    expect(applyCanonicalCrewWorkflow(entity, { ...entity.canonicalWorkflow, blocking_reason: 'Incidencia crítica abierta' }).allowedActions).toEqual([])
  })
  it('uses backend current step and next action for postflight and closure', () => {
    const entity = normalized(workflow({
      crew_status: 'postflight_pending',
      current_step: 'postflight',
      current_phase: 'postflight',
      next_action: null,
      allowed_actions: [],
    }))
    const postflight = buildCrewOperationWorkflowSnapshot(entity)
    expect(postflight.currentStep).toBe('postflight')
    expect(postflight.workflow.currentId).toBe('closure')
    expect(postflight.nextAction).toBeNull()

    const closure = normalized(workflow({
      crew_status: 'report_pending',
      current_step: 'closure',
      current_phase: 'closure',
      next_action: { type: 'submit_report', label: 'Enviar reporte final' },
      allowed_actions: [{ type: 'submit_report', label: 'Enviar reporte final' }],
      checklists: [group('preparation', true), group('preflight', true), group('postflight', true)],
    }))
    const closureSnapshot = buildCrewOperationWorkflowSnapshot(closure)
    expect(closureSnapshot.currentStep).toBe('closure')
    expect(closureSnapshot.nextAction.type).toBe('submit_report')

    const completed = normalized(workflow({
      crew_status: 'crew_completed',
      current_step: 'completed',
      current_phase: 'completed',
      next_action: null,
      allowed_actions: [],
      checklists: [group('preparation', true), group('preflight', true), group('postflight', true)],
    }))
    const completedSnapshot = buildCrewOperationWorkflowSnapshot(completed)
    expect(completedSnapshot.currentStep).toBe('completed')
    expect(completedSnapshot.nextAction).toBeNull()
  })
  it('flags inconsistent history and suppresses stale advertised actions', () => {
    const entity = normalized(workflow({ crew_status: 'boarding', workflow_inconsistent: true, blocking_reason: 'Esta operación requiere regularización del flujo.' }))
    const snapshot = buildCrewOperationWorkflowSnapshot(entity)
    expect(snapshot.workflowInconsistent).toBe(true)
    expect(snapshot.blockingReason).toContain('regularización')
    expect(entity.allowedActions).toEqual([])
    expect(snapshot.workflow.stepsById.get('closure').blocked).toBe(true)
  })
  it('reaches postflight and closure only after all persisted evidence', () => {
    const payload = workflow({ checklists: [group('preparation', true), group('preflight', true), group('postflight')], allowed_actions: [] })
    const statuses = ['crew_checkin', 'cabina_lista', 'boarding', 'pasajeros_recibidos', 'in_flight', 'landed', 'postflight_pending']
    for (const status of statuses) {
      expect(buildCrewOperationWorkflowSnapshot(normalized(payload)).workflow.stepsById.get('closure').blocked).toBe(true)
      payload.timeline.push({ status, created_at: '2026-09-07T10:00:00Z' })
    }
    expect(buildCrewOperationWorkflowSnapshot(normalized(payload)).workflow.currentId).toBe('closure')
    payload.checklists[2] = group('postflight', true)
    expect(buildCrewOperationWorkflowSnapshot(normalized(payload)).workflow.steps.every((step) => step.completed)).toBe(true)
  })
})


describe('checklist evidence normalization', () => {
  const evidence = [{ storage_disk: 's3', file_path: 'crew/cabin.jpg', file_url: 'https://example.test/cabin.jpg' }]
  it.each([undefined, null, [], '', 'invalid json', '{}', 'null'])('normalizes empty or invalid evidence %j to an array', (value) => {
    const snapshot = buildCrewOperationWorkflowSnapshot({ checklists: [{ type: 'postflight', items: [{ id: 7, evidence_files: value }] }] })
    expect(snapshot.checklistGroups[0].items[0].evidence_files).toEqual([])
  })
  it.each([evidence, JSON.stringify(evidence)])('preserves evidence and existing item metadata', (value) => {
    const item = { id: 7, key: 'cabin', label: 'Cabina', status: 'completed', notes: 'Nota', completed_at: '2026-09-08', required: true, metadata: { source: 'backend' }, allowed_actions: [], evidence_files: value }
    const snapshot = buildCrewOperationWorkflowSnapshot({ checklists: [{ type: 'postflight', items: [item] }] })
    expect(snapshot.checklistGroups[0].items[0]).toMatchObject({ ...item, evidence_files: evidence })
  })
})
