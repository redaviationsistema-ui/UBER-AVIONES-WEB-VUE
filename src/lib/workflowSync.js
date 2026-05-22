const WORKFLOW_SYNC_EVENT = 'skygroup:workflow-sync'
const WORKFLOW_SYNC_STORAGE_KEY = 'skygroup.workflow-sync'

function buildPayload(payload = {}) {
  return {
    timestamp: Date.now(),
    ...payload,
  }
}

export function emitWorkflowSync(payload = {}) {
  const nextPayload = buildPayload(payload)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WORKFLOW_SYNC_EVENT, { detail: nextPayload }))
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(WORKFLOW_SYNC_STORAGE_KEY, JSON.stringify(nextPayload))
    } catch {
      // Ignore storage write failures so UI sync never breaks the main flow.
    }
  }

  return nextPayload
}

export function subscribeWorkflowSync(callback) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCustomEvent = (event) => {
    callback(event?.detail || {})
  }

  const handleStorageEvent = (event) => {
    if (event.key !== WORKFLOW_SYNC_STORAGE_KEY || !event.newValue) return

    try {
      callback(JSON.parse(event.newValue))
    } catch {
      callback({})
    }
  }

  window.addEventListener(WORKFLOW_SYNC_EVENT, handleCustomEvent)
  window.addEventListener('storage', handleStorageEvent)

  return () => {
    window.removeEventListener(WORKFLOW_SYNC_EVENT, handleCustomEvent)
    window.removeEventListener('storage', handleStorageEvent)
  }
}
