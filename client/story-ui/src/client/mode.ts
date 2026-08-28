/**
 * Game-mode state shared between the sidebar entry and the shell overlay.
 *
 * The controller is created inside the plugin's `apply` closure (never at
 * module level — that would pin a de-facto singleton across plugin reloads)
 * and exposed to components as a bare observable source through the
 * registrant inject `hooks` compartment, which the renderer binds into a
 * `useGameMode` selector hook. Writes go through `enter`/`exit`/`toggle`
 * callbacks only.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

export interface GameModeController {
  /** Bare observable source; snapshot is `true` while the game shell is active. */
  readonly source: HostObservable<boolean>
  /** Show the game shell. Idempotent: re-entering game mode is a no-op. */
  enter(): void
  /** Return to ordinary chat. Idempotent: exiting while inactive is a no-op. */
  exit(): void
  /** Flip the current mode. */
  toggle(): void
}

/**
 * Create a game-mode controller. Default snapshot is `false`: DSH always
 * boots into the ordinary chat and a page refresh resets to ordinary chat
 * because the state lives only in memory.
 */
export function createGameModeController(): GameModeController {
  const listeners = new Set<() => void>()
  let active = false
  const notify = (): void => { for (const listener of listeners) listener() }
  const write = (next: boolean): void => {
    if (active === next) return
    active = next
    notify()
  }
  return {
    source: {
      getSnapshot: () => active,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    enter: () => { write(true) },
    exit: () => { write(false) },
    toggle: () => { write(!active) },
  }
}
