/** Formatting helpers for the game library. */
import type { SaveSummary } from './host-persistence.ts'

/** Group saves by pack id (ordered by the given order). */
export function groupSavesBySaveId(saves: readonly SaveSummary[]): Map<string, SaveSummary[]> {
  const groups = new Map<string, SaveSummary[]>()
  for (const save of saves) {
    const list = groups.get(save.packId) ?? []
    list.push(save)
    groups.set(save.packId, list)
  }
  return groups
}

/** Human-friendly updated time, falling back to the raw string. */
export function formatUpdated(value: string): string {
  if (value === '') return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
