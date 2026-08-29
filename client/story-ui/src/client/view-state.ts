/**
 * Pure game-shell view state: which channel is selected, per-channel draft
 * text, and whether the side columns are open. All functions are pure so the
 * reducer stays unit-testable without React; the shell component owns the
 * state and keeps it local (component-private, per the slot discipline).
 *
 * Nothing here persists: drafts survive only while the page lives, and a
 * refresh returns DSH to ordinary chat with the game state discarded.
 */
import type { StoryChannel } from './mock-data.ts'

export interface GameViewState {
  readonly selectedChannelId: string
  readonly drafts: Readonly<Record<string, string>>
  readonly leftOpen: boolean
  readonly rightOpen: boolean
}

/** Ephemeral shell errors keyed by save so late async failures cannot leak across saves. */
export type SaveErrorState = Readonly<Record<string, string>>

export type PanelSide = 'left' | 'right'

/** Initial state: first pinned channel, empty drafts, both columns open. */
export function initialViewState(channels: readonly StoryChannel[]): GameViewState {
  const first = channels.find(channel => channel.pinned) ?? channels[0]
  if (first === undefined) throw new Error('view-state: channel list must not be empty')
  return {
    selectedChannelId: first.id,
    drafts: {},
    leftOpen: true,
    rightOpen: true,
  }
}

/** Selecting another channel keeps every draft where it was written. */
export function selectChannel(state: GameViewState, channelId: string): GameViewState {
  if (state.selectedChannelId === channelId) return state
  return { ...state, selectedChannelId: channelId }
}

/** Drafts are keyed per channel so switching channels never leaks text. */
export function setDraft(state: GameViewState, channelId: string, text: string): GameViewState {
  const previous = state.drafts[channelId] ?? ''
  if (previous === text) return state
  return { ...state, drafts: { ...state.drafts, [channelId]: text } }
}

/** Read only the error belonging to the selected save. */
export function saveErrorFor(state: SaveErrorState, saveId: string): string | undefined {
  return state[saveId]
}

/** Set or clear one save's error without disturbing errors belonging to other saves. */
export function updateSaveError(state: SaveErrorState, saveId: string, error: string | undefined): SaveErrorState {
  const previous = state[saveId]
  if (previous === error) return state
  if (error === undefined) {
    if (previous === undefined) return state
    const next = { ...state }
    delete next[saveId]
    return next
  }
  return { ...state, [saveId]: error }
}

export function togglePanel(state: GameViewState, side: PanelSide): GameViewState {
  if (side === 'left') return { ...state, leftOpen: !state.leftOpen }
  return { ...state, rightOpen: !state.rightOpen }
}

/**
 * Narrow-viewport fallback: when the viewport drops below the three-column
 * breakpoint the side columns start closed so the message column is never
 * trapped behind an overlay.
 */
export function narrowFallback(state: GameViewState): GameViewState {
  if (!state.leftOpen && !state.rightOpen) return state
  return { ...state, leftOpen: false, rightOpen: false }
}
