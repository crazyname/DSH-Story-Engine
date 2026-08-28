import { describe, expect, it, vi } from 'vitest'
import { createGameModeController } from '../src/client/mode.ts'

/** Collect snapshots notified through the observable source. */
function recorder(controller: ReturnType<typeof createGameModeController>): boolean[] {
  const seen: boolean[] = [controller.source.getSnapshot()]
  controller.source.subscribe(() => { seen.push(controller.source.getSnapshot()) })
  return seen
}

describe('game mode controller', () => {
  it('defaults to ordinary chat (false)', () => {
    const controller = createGameModeController()
    expect(controller.source.getSnapshot()).toBe(false)
  })

  it('enter switches to game mode and notifies subscribers once', () => {
    const controller = createGameModeController()
    const listener = vi.fn()
    controller.source.subscribe(listener)
    controller.enter()
    expect(controller.source.getSnapshot()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('exit returns to ordinary chat', () => {
    const controller = createGameModeController()
    controller.enter()
    controller.exit()
    expect(controller.source.getSnapshot()).toBe(false)
  })

  it('repeated enter and repeated exit are no-ops without notifications', () => {
    const controller = createGameModeController()
    const listener = vi.fn()
    controller.source.subscribe(listener)
    controller.enter()
    controller.enter()
    controller.enter()
    expect(listener).toHaveBeenCalledTimes(1)
    controller.exit()
    controller.exit()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(controller.source.getSnapshot()).toBe(false)
  })

  it('toggle flips both directions', () => {
    const controller = createGameModeController()
    controller.toggle()
    expect(controller.source.getSnapshot()).toBe(true)
    controller.toggle()
    expect(controller.source.getSnapshot()).toBe(false)
  })

  it('unsubscribe stops notifications', () => {
    const controller = createGameModeController()
    const listener = vi.fn()
    const unsubscribe = controller.source.subscribe(listener)
    unsubscribe()
    controller.enter()
    expect(listener).not.toHaveBeenCalled()
  })

  it('snapshot sequence covers default, enter, exit and re-enter', () => {
    const controller = createGameModeController()
    const seen = recorder(controller)
    controller.enter()
    controller.exit()
    controller.enter()
    expect(seen).toEqual([false, true, false, true])
  })
})
