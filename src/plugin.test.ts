import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { apply, inject, name } from './plugin.js'

describe('DSH plugin', () => {
  it('registers the generic tools and requires operation ids on canonical mutations', async () => {
    const tools: Array<{ name: string; parameters?: { properties?: Record<string, { type?: string }>; required?: string[] } }> = []
    const sections: string[] = []
    const context = {
      tools: { register(tool: { name: string; parameters?: { properties?: Record<string, { type?: string }>; required?: string[] } }) { tools.push(tool) } },
      systemPrompt: { section(section: { name: string }) { sections.push(section.name) } },
      userQuestions: { async ask() { return { answers: [] } } },
    }
    await apply(context as never, { packRoot: resolve('packs/example'), runtimeRoot: resolve('runtime-test') })
    expect(name).toBe('dsh-story-engine')
    expect(inject).toEqual(['tools', 'systemPrompt', 'userQuestions'])
    expect(tools).toHaveLength(20)
    expect(tools.every(tool => tool.name.startsWith('story_'))).toBe(true)
    expect(sections).toEqual(['story:lantern-station:game-master'])

    const canonicalMutations = [
      'story_commit_state',
      'story_advance_scene',
      'story_initialize_episode_state',
      'story_enter_episode_scene',
      'story_record_script_choice',
      'story_record_work_event',
      'story_pause_for_revision',
      'story_submit_script_revision',
      'story_record_episode_summary',
    ]
    for (const mutation of canonicalMutations) {
      const tool = tools.find(item => item.name === mutation)
      expect(tool?.parameters?.properties?.operation_id?.type, mutation).toBe('string')
      expect(tool?.parameters?.required, mutation).toContain('operation_id')
    }
    expect(tools.find(item => item.name === 'story_create_checkpoint')?.parameters?.properties?.operation_id).toBeUndefined()
  })
})
