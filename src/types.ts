export interface StoryPackManifest {
  schemaVersion: 1
  id: string
  name: string
  version: string
  language: string
  license: string
  description?: string
  player: {
    controlledCharacters: string[]
    aiMayControlPlayer: boolean
  }
  modules: Record<string, boolean>
  content: {
    world?: string
    characters?: string
    lore?: string
    mechanics?: string
    story?: string
    initialState: string
    gameMasterPrompt?: string
  }
}

export interface ContentDocument {
  id: string
  kind: 'world' | 'characters' | 'lore' | 'mechanics' | 'story' | 'prompt'
  relativePath: string
  mediaType: 'text/markdown' | 'application/json' | 'application/x-ndjson' | 'text/plain'
  text: string
}

export interface LoadedStoryPack {
  root: string
  manifest: StoryPackManifest
  initialState: Record<string, unknown>
  documents: ContentDocument[]
}
