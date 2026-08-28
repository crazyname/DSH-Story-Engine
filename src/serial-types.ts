export type EpisodeStatus = 'draft' | 'validated' | 'playing' | 'completed' | 'superseded'
export type WorkResult = 'perfect' | 'success' | 'partial' | 'failure' | 'disaster'
export type PauseState = 'running' | 'paused-for-revision' | 'validating-revision'

export interface EpisodeScript {
  schemaVersion: 1
  episodeId: string
  season: number
  episode: number
  title: string
  status: EpisodeStatus
  continuity: { startsAfter: string; fixedFacts: string[]; openThreads: string[]; seasonDecision: { mode: 'continue_current_season' | 'start_new_season'; reason: string } }
  scenes: Scene[]
  ending: { completionConditions: string[]; recap: { includeChosen: true; includeDeclined: true; includeConsequences: boolean; showNetworkPercentages: false; revealHiddenBranches: false } }
  revision: { version: number; outOfScriptPolicy: 'immediate_pause_revise_validate_resume'; history: RevisionEntry[] }
}
export interface RevisionEntry { version: number; reason: string; changedAt: string }
export interface SceneTransition { condition: string; nextScene: string }
export interface ChoiceOption { id: string; label: string; consequenceTags: string[]; nextScene?: string }
export interface Choice { id: string; prompt: string; allowFreeInput: true; options: ChoiceOption[] }
export interface WorkEvent { id?: string; name: string; assignedActors: string[]; result: WorkResult; stateEffects: string[] }
export interface WorkSummary { autoResolveMinorEvents: boolean; events: WorkEvent[] }
export interface Scene {
  id: string; mode: 'work' | 'off_work'; title: string; entryConditions: string[]; cast: string[]
  fixedFacts: string[]; characterGoals: Record<string, string>; secrets: string[]; beats: string[]
  choices: Choice[]; dialogueAnchors: string[]; improvisationEnvelope: string[]; exitConditions: string[]
  transitions: SceneTransition[]; stateEffects: string[]; workSummary?: WorkSummary
}
export interface ScriptRecord { episodeId: string; season: number; episode: number; title: string; status: EpisodeStatus; version: number; scriptPath: string; sceneIds: string[] }
export interface ChoiceRecord { episodeId: string; sceneId: string; choiceId: string; selectedOptionIds: string[]; freeInput?: string; consequences: string[]; createdAt: string }
export interface PlayedEvent {
  id: string
  type: 'scene_entered' | 'dialogue' | 'narration' | 'action' | 'system' | 'choice' | 'work_dispatch' | 'work_summary' | 'checkpoint_created' | 'pause_triggered' | 'revision_submitted' | 'episode_summary'
  content?: string; sceneId?: string; episodeId?: string; branchId?: string; turnId: string; createdAt: string; metadata?: Record<string, unknown>
}
export interface EpisodeSummary {
  season: number; episodeId: string; sceneId: string
  chosen: Array<{ choiceId: string; selected: Array<{ id: string; label: string }> }>
  declined: Array<{ choiceId: string; options: Array<{ id: string; label: string }> }>
  freeInputs: Array<{ choiceId: string; input: string }>; consequences: string[]; relationshipChanges: string[]; createdAt: string
}
export interface RuntimeState {
  _engine: { schemaVersion: 2; stateVersion: number; packId: string; createdAt: string; updatedAt?: string }
  _pack: { id: string; name: string; version: string; language: string; license: string; player: { controlledCharacters: string[]; aiMayControlPlayer: boolean } }
  sourceCanon: Record<string, unknown>
  authoredScript: { scripts: Record<string, ScriptRecord>; runtimeScriptRoot: string }
  playedCanon: {
    events: PlayedEvent[]; choices: ChoiceRecord[]; completedScenes: string[]; currentEpisodeId: string | null
    currentSceneId: string | null; currentBranch: string | null; currentSeason: number | null; currentEpisode: number | null
    checkpoints: Record<string, string>; pauseState: PauseState
    pendingRevision?: { reason: string; input: string; resumePoint: string; pausedAt: string }
    episodeSummaries: Record<string, EpisodeSummary>
  }
  workCache: { pendingEvents: WorkEvent[] }; drafts: Record<string, string>
  campaign: Record<string, unknown>; world: Record<string, unknown>; relationships: Record<string, unknown>; resources: Record<string, unknown>
  activeMissions: unknown[]; openThreads: unknown[]; flags: Record<string, unknown>; history: unknown[]
}
