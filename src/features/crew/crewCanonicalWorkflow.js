// Permission flags are projections of the backend contract, never inferred from status.
export function applyCanonicalCrewWorkflow(assignment, workflow = {}) {
  const recoverableActions = Array.isArray(workflow.recoverable_actions) ? workflow.recoverable_actions : []
  const allowedActions = workflow.blocking_reason && recoverableActions.length === 0 || (workflow.workflow_inconsistent && !workflow.recoverable && recoverableActions.length === 0)
    ? [] : Array.isArray(workflow.allowed_actions) ? workflow.allowed_actions : []
  const has = (type) => allowedActions.some((action) => action.type === type)
  return {
    ...assignment,
    canonicalWorkflowLoaded: Boolean(workflow.operation_id && Array.isArray(workflow.allowed_actions)),
    workflowStatus: workflow.crew_status || workflow.status || '',
    crewStatus: workflow.crew_status || workflow.status || '',
    operationStatus: workflow.operation_status || assignment.operationStatus,
    assignment: { ...assignment.assignment, status: workflow.assignment_status || assignment.assignment?.status },
    timeline: workflow.timeline || [],
    tracking_events: [], // The API's tracking_events aliases timeline, not coded milestones.
    checklists: workflow.checklists || [],
    finalReport: workflow.final_report || workflow.report || null,
    crewCheckinAt: workflow.crew_checkin_at || workflow.checkin?.recorded_at || null,
    canonicalWorkflow: workflow,
    allowedActions: allowedActions.length ? allowedActions : recoverableActions,
    currentStep: workflow.current_step || '',
    currentPhase: workflow.current_phase || '',
    nextAction: workflow.next_action || (allowedActions[0] || recoverableActions[0] || null),
    canCheckin: has('crew_checkin'),
    canMarkCabinReady: has('cabin_ready'),
    canReceivePassengers: has('passengers_ready'),
    canStartBoarding: allowedActions.some((action) => action.type === 'transition' && action.status === 'boarding'),
    canStartService: false,
    canFinalizeService: has('submit_report'),
  }
}

export function crewMilestoneAction(actions = [], code) {
  return actions.find((action) => ({
    crew_checkin: 'airport_arrival', cabin_ready: 'aircraft_ready',
    passengers_ready: 'passengers_on_board', departure: 'departure',
    landing: 'landing', disembark: 'passengers_disembarked',
  }[action.type] || (action.type === 'transition' && action.status === 'boarding' ? 'passengers_arrived' : '')) === code) || null
}
