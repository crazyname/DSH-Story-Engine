import { describe, expect, it } from 'vitest'
import { CHANNELS, MESSAGES, PARTICIPANTS, messagesOfChannel, participantById } from '../src/client/mock-data.ts'

describe('mock data invariants', () => {
  it('every channel participant exists', () => {
    for (const channel of CHANNELS) {
      for (const id of channel.participantIds) {
        expect(participantById(id), `${channel.id} 引用了未知人物 ${id}`).toBeDefined()
      }
    }
  })

  it('channel and message ids are unique', () => {
    expect(new Set(CHANNELS.map(c => c.id)).size).toBe(CHANNELS.length)
    expect(new Set(MESSAGES.map(m => m.id)).size).toBe(MESSAGES.length)
  })

  it('every message belongs to a known channel with an existing sender', () => {
    const channelIds = new Set(CHANNELS.map(c => c.id))
    for (const message of MESSAGES) {
      expect(channelIds.has(message.channelId), `${message.id} 的频道不存在`).toBe(true)
      expect(participantById(message.senderId), `${message.id} 的发送者不存在`).toBeDefined()
    }
  })

  it('lastMessageId points at a message of that channel', () => {
    for (const channel of CHANNELS) {
      if (channel.lastMessageId === undefined) continue
      const message = MESSAGES.find(m => m.id === channel.lastMessageId)
      expect(message, `${channel.id} 的 lastMessageId 无效`).toBeDefined()
      expect(message!.channelId).toBe(channel.id)
    }
  })

  it('covers at least one direct, one group and one scene channel', () => {
    const kinds = new Set(CHANNELS.map(c => c.kind))
    expect(kinds.has('direct')).toBe(true)
    expect(kinds.has('group')).toBe(true)
    expect(kinds.has('scene')).toBe(true)
  })

  it('group channels have three or more participants', () => {
    for (const channel of CHANNELS.filter(c => c.kind === 'group')) {
      expect(channel.participantIds.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('every participant id is unique and the player exists exactly once', () => {
    expect(new Set(PARTICIPANTS.map(p => p.id)).size).toBe(PARTICIPANTS.length)
    expect(PARTICIPANTS.filter(p => p.role === 'player')).toHaveLength(1)
  })

  it('messagesOfChannel returns only that channel messages in order', () => {
    const direct = messagesOfChannel('c-direct-hezhou')
    expect(direct.length).toBeGreaterThan(0)
    expect(direct.every(m => m.channelId === 'c-direct-hezhou')).toBe(true)
    const ids = MESSAGES.map(m => m.id)
    const positions = direct.map(m => ids.indexOf(m.id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })
})
