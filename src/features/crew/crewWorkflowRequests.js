export function createCrewWorkflowRequests(request) {
  const pending = new Map()
  let disposed = false
  return {
    load(operationId) {
      const id = String(operationId)
      if (disposed) return Promise.reject(new DOMException('Portal cerrado', 'AbortError'))
      if (pending.has(id)) return pending.get(id).promise
      const controller = new AbortController()
      const promise = Promise.resolve().then(() => request(id, controller.signal)).then((result) => {
        if (controller.signal.aborted) throw new DOMException('Operación cambiada', 'AbortError')
        return result
      }).finally(() => { if (pending.get(id)?.controller === controller) pending.delete(id) })
      pending.set(id, { controller, promise })
      return promise
    },
    retain(operationIds) {
      const keep = new Set(operationIds.map(String))
      for (const [id, item] of pending) if (!keep.has(id)) { item.controller.abort(); pending.delete(id) }
    },
    dispose() {
      disposed = true
      for (const item of pending.values()) item.controller.abort()
      pending.clear()
    },
  }
}
