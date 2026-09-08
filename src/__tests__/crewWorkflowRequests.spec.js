import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCrewWorkflowRequests } from '../features/crew/crewWorkflowRequests'
afterEach(() => vi.useRealTimers())
describe('workflow request lifecycle', () => {
  it('does not abort at 15 seconds and shares same-operation requests', async () => {
    vi.useFakeTimers()
    let finish
    let signal
    const request = vi.fn((id, currentSignal) => { signal = currentSignal; return new Promise((resolve) => { finish = resolve }) })
    const client = createCrewWorkflowRequests(request)
    const first = client.load(46)
    expect(client.load(46)).toBe(first)
    await Promise.resolve()
    client.retain([46])
    await vi.advanceTimersByTimeAsync(15001)
    expect(signal.aborted).toBe(false)
    finish({ operation_id: 46 })
    expect(await first).toEqual({ operation_id: 46 })
    expect(request).toHaveBeenCalledTimes(1)
  })
  it.each(['change', 'unmount'])('cancels intentionally on %s with its own signal', async (reason) => {
    let finish
    let signal
    const client = createCrewWorkflowRequests((id, currentSignal) => { signal = currentSignal; return new Promise((resolve) => { finish = resolve }) })
    const promise = client.load(46)
    await Promise.resolve()
    if (reason === 'change') client.retain([47]); else client.dispose()
    expect(signal.aborted).toBe(true)
    finish({ operation_id: 46 })
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
