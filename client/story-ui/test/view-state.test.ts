import { describe, expect, it } from 'vitest'
import type { StoryChannel } from '../src/client/mock-data.ts'
import { initialViewState, narrowFallback, selectChannel, setDraft, togglePanel } from '../src/client/view-state.ts'

const channels: readonly StoryChannel[] = [
  { id: 'a', kind: 'group', title: '群', participantIds: [], category: 'personal', pinned: false },
  { id: 'b', kind: 'direct', title: '私聊', participantIds: [], category: 'personal', pinned: true },
]

describe('game view state', () => {
  it('selects the first pinned channel by default', () => {
    const state = initialViewState(channels)
    expect(state.selectedChannelId).toBe('b')
    expect(state.drafts).toEqual({})
    expect(state.leftOpen).toBe(true)
    expect(state.rightOpen).toBe(true)
  })

  it('falls back to the first channel when none is pinned', () => {
    const unpinned = channels.map(channel => ({ ...channel, pinned: false }))
    expect(initialViewState(unpinned).selectedChannelId).toBe('a')
  })

  it('rejects an empty channel list', () => {
    expect(() => initialViewState([])).toThrow()
  })

  it('switching channels keeps drafts per channel', () => {
    let state = initialViewState(channels)
    state = setDraft(state, 'b', '在吗')
    state = selectChannel(state, 'a')
    expect(state.drafts['b']).toBe('在吗')
    state = setDraft(state, 'a', '频道 A 的草稿')
    state = selectChannel(state, 'b')
    expect(state.drafts['b']).toBe('在吗')
    expect(state.drafts['a']).toBe('频道 A 的草稿')
  })

  it('selecting the same channel is a no-op (same reference)', () => {
    const state = initialViewState(channels)
    expect(selectChannel(state, 'b')).toBe(state)
  })

  it('toggling panels flips independently', () => {
    let state = initialViewState(channels)
    state = togglePanel(state, 'left')
    expect(state.leftOpen).toBe(false)
    expect(state.rightOpen).toBe(true)
    state = togglePanel(state, 'right')
    expect(state.leftOpen).toBe(false)
    expect(state.rightOpen).toBe(false)
    state = togglePanel(state, 'left')
    expect(state.leftOpen).toBe(true)
  })

  it('narrow fallback closes both columns once and is idempotent', () => {
    let state = initialViewState(channels)
    state = narrowFallback(state)
    expect(state.leftOpen).toBe(false)
    expect(state.rightOpen).toBe(false)
    expect(narrowFallback(state)).toBe(state)
  })
})
