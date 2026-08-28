import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { apply, inject, name } from './plugin.js'

describe('DSH plugin', () => {
  it('registers the generic prompt and v0.6 + v0.7 tools', async () => {
    const tools: string[] = []
    const sections: string[] = []
    const context = {
      tools: { register(tool: { name: string }) { tools.push(tool.name) } },
      systemPrompt: { section(section: { name: string }) { sections.push(section.name) } },
      userQuestions: { async ask() { return { answers: [] } } },
    }
    await apply(context as never, { packRoot: resolve('packs/example'), runtimeRoot: resolve('runtime-test') })
    expect(name).toBe('dsh-story-engine')
    expect(inject).toEqual(['tools', 'systemPrompt', 'userQuestions'])
    expect(tools).toHaveLength(20)
    expect(tools.every(tool => tool.startsWith('story_'))).toBe(true)
    expect(sections).toEqual(['story:lantern-station:game-master'])
  })
})
