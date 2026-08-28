/**
 * Game library domain: installed content packs and their saves.
 *
 * The host owns the authoritative save list (`/story-engine/api/saves`);
 * the host also owns the dynamic installed-pack catalog. This module keeps a
 * fixture fallback for tests and provides the "new game" factory that mints a
 * fresh save id and initial projection.
 */
import type { SaveSummary } from './host-persistence.ts'
import type { StorySaveProjection } from './story-domain.ts'
import { createInitialProjection } from './initial-projection.ts'

/** One installed content pack as the library shows it. */
export interface StoryPack {
  packId: string
  title: string
  author: string
  version: string
  /** Compatibility status; a pack missing required engine features shows a diagnostic. */
  status: 'ready' | 'diagnostic'
  description: string
  agentPreset: string
  diagnostic?: string
  template?: StorySaveProjection
}

/** Fixture fallback used by isolated tests; production loads the host catalog. */
export const INSTALLED_PACKS: readonly StoryPack[] = [
  {
    packId: 'lantern-station',
    title: '雾海灯塔站',
    author: 'DSH Story Engine',
    version: '1.0.0',
    status: 'ready',
    description: '用于测试引擎的原创短篇世界：雾潮提前抵达，主透镜出现裂纹，选择决定整夜的走向。',
    agentPreset: 'story-lantern-station',
    template: createInitialProjection(),
  },
]

/** Group a host save list by pack id. */
export function groupSavesByPack(saves: readonly SaveSummary[]): Map<string, SaveSummary[]> {
  const groups = new Map<string, SaveSummary[]>()
  for (const save of saves) {
    const list = groups.get(save.packId) ?? []
    list.push(save)
    groups.set(save.packId, list)
  }
  return groups
}

/** Packs that are installed but currently have no save (for the "new game" entry). */
export function packsWithoutSaves(packs: readonly StoryPack[], grouped: Map<string, SaveSummary[]>): StoryPack[] {
  return packs.filter((pack) => !grouped.has(pack.packId))
}

/** A fresh save id: pack slug + timestamp + random suffix, host-safe ([a-zA-Z0-9_-]). */
export function newSaveId(packId: string): string {
  const slug = packId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'game'
  return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Create the initial projection for a new game of the given pack. */
export function createNewGame(pack: StoryPack, saveId: string): StorySaveProjection {
  if(pack.status!=='ready'||pack.template===undefined)throw new Error(pack.diagnostic??'内容包缺少文字游戏界面描述')
  const base=structuredClone(pack.template)
  return { ...base,saveId,packId:pack.packId,packTitle:pack.title,agentPreset:pack.agentPreset,revision:0,updatedAt:new Date().toISOString() }
}

/** Clone a save under a new id (save-as / branch). Revision resets to 0 so the
 *  new save bootstraps through the host without a stale revision conflict. */
export function cloneSave(source: StorySaveProjection, saveId: string): StorySaveProjection {
  return {
    ...structuredClone(source),
    saveId,
    revision: 0,
    updatedAt: new Date().toISOString(),
  }
}
