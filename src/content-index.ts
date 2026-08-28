import type { ContentDocument } from './types.js'

export class ContentIndex {
  constructor(private readonly documents: readonly ContentDocument[]) {}

  get(id: string): ContentDocument {
    const document = this.documents.find(item => item.id === id)
    if (!document) throw new Error(`找不到内容记录：${id}`)
    return { ...document }
  }

  search(query: string, limit = 8, kind?: ContentDocument['kind']): Array<ContentDocument & { score: number }> {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    if (!terms.length) throw new Error('query 不能为空')
    return this.documents
      .filter(document => !kind || document.kind === kind)
      .map(document => {
        const text = `${document.relativePath}\n${document.text}`.toLocaleLowerCase()
        if (!terms.every(term => text.includes(term))) return null
        const score = terms.reduce((sum, term) => sum + text.split(term).length - 1, 0)
        return { ...document, text: document.text.slice(0, 2000), score }
      })
      .filter((item): item is ContentDocument & { score: number } => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 1), 20))
  }
}
