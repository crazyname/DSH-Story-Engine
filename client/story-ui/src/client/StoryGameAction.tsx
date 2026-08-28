/**
 * The 文字游戏 sidebar footer action: a wide row (icon + label) when the
 * sidebar is expanded, an icon-only button with an accessible name when it
 * is folded to the rail. Opening never touches ordinary-chat state — the
 * conversation components stay mounted underneath the overlay.
 */
import { IconPlayOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './StoryGameAction.module.css'

/** Injected face of the sidebar entry (the hooks compartment is bound to `useGameMode`). */
export interface StoryGameInjected {
  /** Show the game shell. */
  enterGame: () => void
  /** Bare observable riding the reserved hooks compartment. */
  hooks: { gameMode: HostObservable<boolean> }
}

/** Full props: the list-slot runtime share (owner `wide` included) + the bound inject face. */
export type StoryGameActionProps = PropsRuntime<'sidebar.footer.action'> & InjectFace<StoryGameInjected>

/**
 * Render the sidebar foot entry.
 * @param props - `wide` owner share plus the injected enter callback and bound `useGameMode` hook.
 * @returns the entry button.
 */
export function StoryGameAction({ wide, enterGame, useGameMode }: StoryGameActionProps) {
  const active = useGameMode(mode => mode)
  if (wide) {
    return (
      <button type="button" className={css.action} onClick={enterGame} aria-expanded={active}>
        <IconPlayOutline16 size={16} />
        <span className={css.label}>文字游戏</span>
      </button>
    )
  }
  return (
    <button
      type="button"
      className={css.railAction}
      onClick={enterGame}
      aria-expanded={active}
      aria-label="文字游戏"
      title="文字游戏"
    >
      <IconPlayOutline16 size={18} />
    </button>
  )
}
