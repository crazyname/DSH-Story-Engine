import type { ContentDocument } from './types.js'

export class EntityIndex {
  private readonly entities: Record<string, any>[] = []

  constructor(documents: readonly ContentDocument[]) {
    for (const document of documents.filter(item => item.kind === 'characters' && item.mediaType === 'application/json')) {
      try {
        const value = JSON.parse(document.text)
        if (Array.isArray(value)) this.entities.push(...value.filter(item => item && typeof item === 'object'))
        else if (value && typeof value === 'object') this.entities.push(value)
      } catch { /* malformed JSON is reported by import validation in a later schema pass */ }
    }
  }

  find(query: string, limit = 10): Record<string, any>[] {
    const key = query.trim().toLocaleLowerCase()
    if (!key) throw new Error('query 不能为空')
    return this.entities.filter(entity => JSON.stringify(entity).toLocaleLowerCase().includes(key)).slice(0, Math.min(Math.max(limit, 1), 20))
  }
}
