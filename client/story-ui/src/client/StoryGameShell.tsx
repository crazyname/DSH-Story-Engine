/**
 * The Stage-A game shell, rendered as a `shell.overlay` entry.
 *
 * While game mode is inactive the component returns null — no DOM at all, so
 * the DSH overlay layer stays click-through and ordinary chat keeps every
 * pointer, keyboard and screen-reader event. While active it paints an
 * opaque full-frame surface with its own header, three-column mock layout
 * and a 返回普通聊天 action, and isolates focus by marking the app frame's
 * other columns inert for as long as it is mounted.
 */
import { useEffect, useMemo, useState } from 'react'
import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronLeftOutline14, IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  initialViewState, narrowFallback, saveErrorFor, selectChannel, setDraft, togglePanel, updateSaveError,
  type GameViewState, type PanelSide, type SaveErrorState,
} from './view-state.ts'
import { appendAiMessages, appendChoiceRecord, appendPlayerMessage, updateDraft, type StoryMessage, type StorySaveProjection, type AiMessageInput } from './story-domain.ts'
import { createInitialProjection } from './initial-projection.ts'
import { createLocalProjectionStorage } from './persistence.ts'
import { HostProjectionStorage, type SaveSummary } from './host-persistence.ts'
import { ChoiceCard } from './ChoiceCard.tsx'
import { StoryGameLibrary } from './StoryGameLibrary.tsx'
import { INSTALLED_PACKS, cloneSave, createNewGame, newSaveId } from './game-library.ts'
import type { StoryChoiceBridge, StoryChoiceCard } from './choice-bridge.ts'
import type { AiBridgeResult, AiTurn, OrphanedSessionDiagnostic, RecoveredAiBridgeResult } from './ai-bridge.ts'
import css from './StoryGameShell.module.css'

/** Injected face of the overlay entry (hooks compartment bound to `useGameMode`). */
export interface StoryGameShellInjected {
  /** Return to ordinary chat. */
  exitGame: () => void
  sendToAI:(projection:StorySaveProjection,channelId:string,input:string)=>Promise<AiBridgeResult>
  recoverAiTurn:(projection:StorySaveProjection)=>Promise<RecoveredAiBridgeResult|null>
  cancelAiTurn:(saveId:string)=>Promise<void>
  retryAiTurn:(projection:StorySaveProjection)=>Promise<AiBridgeResult>
  acknowledgeAiTurn:(saveId:string,turnId:string)=>void
  aiTurn:(saveId:string)=>AiTurn|null
  markWaitingChoice:(saveId:string,sessionId:string)=>void
  forkAiSession:(sourceSaveId:string,targetSaveId:string,packId:string)=>Promise<string|null>
  releaseAiSave:(saveId:string,packId?:string)=>Promise<OrphanedSessionDiagnostic|undefined>
  /** Choice-card bridge answering story_present_choice inside the shell. */
  choices: StoryChoiceBridge
  /** Bare observable riding the reserved hooks compartment. */
  hooks: { gameMode: HostObservable<boolean> }
}

/** Full props: the list-slot runtime share + the bound inject face. */
export type StoryGameShellProps = PropsRuntime<'shell.overlay'> & InjectFace<StoryGameShellInjected>

/** Narrow breakpoint (px) below which the side columns become drawers. */
const NARROW_BREAKPOINT = 900

/**
 * Render the game shell overlay entry.
 * @param props - injected exit callback plus the bound `useGameMode` hook.
 * @returns the full-frame game shell, or null while game mode is inactive.
 */
export function StoryGameShell({ exitGame, sendToAI, recoverAiTurn, cancelAiTurn, retryAiTurn, acknowledgeAiTurn, aiTurn, markWaitingChoice, forkAiSession, releaseAiSave, choices, useGameMode }: StoryGameShellProps) {
  const active = useGameMode(mode => mode)
  const storage = useMemo(() => createLocalProjectionStorage(window.localStorage), [])
  const hostStorage = useMemo(() => new HostProjectionStorage(), [])
  const [screen, setScreen] = useState<'library'|'game'>('library')
  const [packs,setPacks]=useState(()=>[...INSTALLED_PACKS])
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const [libraryError, setLibraryError] = useState<string|undefined>()
  const [projection, setProjection] = useState<StorySaveProjection>(() => storage.load('lantern-demo-save') ?? createInitialProjection())
  const [view, setView] = useState<GameViewState>(() => ({...initialViewState(projection.channels),selectedChannelId:projection.selectedChannelId,drafts:projection.drafts}))
  const [narrow, setNarrow] = useState(false)
  const [hostReady,setHostReady]=useState(false)
  const [syncErrors,setSyncErrors]=useState<SaveErrorState>({})
  const [generatingSaves,setGeneratingSaves]=useState<Set<string>>(()=>new Set())
  const [choiceCard,setChoiceCard]=useState<StoryChoiceCard|undefined>()
  const [choiceError,setChoiceError]=useState<string|undefined>()
  const [,setTurnRefresh]=useState(0)

  const setSaveSyncError=(saveId:string,error:string|undefined):void=>{
    setSyncErrors(current=>updateSaveError(current,saveId,error))
  }

  // Subscribe to story_present_choice cards while the shell is active.
  useEffect(() => {
    if (!active) return
    return choices.subscribe((card) => {
      setChoiceCard(card)
      if (card !== undefined) markWaitingChoice(projection.saveId, card.sessionId)
      if (card === undefined) setChoiceError(undefined)
    })
  }, [active, choices, markWaitingChoice, projection.saveId])

  // On entry: refresh the authoritative save list from the host and open the
  // library (a save is only auto-selected on explicit continue).
  useEffect(() => {
    if (!active || screen !== 'library') return
    let cancelled = false
    void (async () => {
      try {
        const [list,catalog] = await Promise.all([hostStorage.list(),hostStorage.listPacks()])
        if (cancelled) return
        setSaves(list)
        setPacks(catalog)
        setLibraryError(undefined)
      } catch (error) {
        if (!cancelled) setLibraryError(error instanceof Error ? error.message : String(error))
      }
    })()
    return () => { cancelled = true }
  }, [active, screen, hostStorage])

  // Keep the host copy in sync once a projection is loaded; bootstrap on the
  // first save of a fresh save id.
  useEffect(()=>{
    if(!active||screen!=='game'||hostReady)return
    let cancelled=false
    const saveId=projection.saveId
    void (async()=>{
      try{
        const remote=await hostStorage.load(saveId)
        if(cancelled)return
        if(remote!==undefined){storage.save(remote);setProjection(current=>current.saveId===saveId?remote:current);setView(state=>({...state,selectedChannelId:remote.selectedChannelId,drafts:remote.drafts}))}
        else{await hostStorage.save(projection,true)}
        setHostReady(true)
      }catch(error){if(!cancelled){setSaveSyncError(saveId,error instanceof Error?error.message:String(error));setHostReady(true)}}
    })()
    return()=>{cancelled=true}
  },[active,screen,hostReady,hostStorage,projection,storage])

  const persist=(next:typeof projection):void=>{const saveId=next.saveId;storage.save(next);void hostStorage.save(next).then(()=>{setSaveSyncError(saveId,undefined)},error=>{setSaveSyncError(saveId,error instanceof Error?error.message:String(error))})}
  const commitAiResult=(saveId:string,channelId:string,result:{messages:AiMessageInput[]},turnId:string|undefined,fallback:StorySaveProjection):void=>{
    const latest=storage.load(saveId)??fallback
    const next=appendAiMessages(latest,channelId,result.messages,new Date(),turnId)
    storage.save(next)
    void hostStorage.save(next).then(()=>{
      if(turnId!==undefined)acknowledgeAiTurn(saveId,turnId)
      setSaveSyncError(saveId,undefined)
    },error=>{setSaveSyncError(saveId,error instanceof Error?error.message:String(error))})
    setProjection(current=>current.saveId===saveId?next:current)
  }
  const recoverPending=(save:StorySaveProjection):void=>{
    if(generatingSaves.has(save.saveId))return
    setGeneratingSaves(current=>new Set(current).add(save.saveId))
    void recoverAiTurn(save).then(recovered=>{
      if(recovered!==null)commitAiResult(save.saveId,recovered.channelId,recovered.result,recovered.turnId,save)
    },error=>{setSaveSyncError(save.saveId,error instanceof Error?error.message:String(error))}).finally(()=>{
      setGeneratingSaves(current=>{const next=new Set(current);next.delete(save.saveId);return next})
    })
  }

  // Narrow-viewport fallback: drawers start closed so the message column is
  // never trapped; wide viewports keep the three-column default.
  useEffect(() => {
    if (!active) return
    const query = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`)
    const apply = (): void => {
      setNarrow(query.matches)
      if (query.matches) setView(state => narrowFallback(state))
    }
    apply()
    query.addEventListener('change', apply)
    return () => { query.removeEventListener('change', apply) }
  }, [active])

  // Focus isolation: the overlay layer's siblings are the app frame columns
  // (sidebar / conversation / details). Marking them inert keeps Tab and
  // assistive tech inside the game shell without touching their DOM tree;
  // the attribute is restored on cleanup. Ordinary chat state (selection,
  // scroll, drafts) survives untouched because the components stay mounted.
  useEffect(() => {
    if (!active) return
    const layer = document.querySelector('[data-shell-overlay]')
    const frame = layer?.parentElement
    const siblings = frame === undefined || frame === null
      ? []
      : Array.from(frame.children).filter(el => el !== layer) as HTMLElement[]
    for (const el of siblings) {
      el.inert = true
      el.setAttribute('aria-hidden', 'true')
    }
    return () => {
      for (const el of siblings) {
        el.inert = false
        el.removeAttribute('aria-hidden')
      }
    }
  }, [active])

  const selected = projection.channels.find(channel => channel.id === view.selectedChannelId) ?? projection.channels[0]!
  const playerId=projection.participants.find(participant=>participant.role==='player')?.id
  const channelMessages = useMemo(() => projection.messages.filter(message => message.channelId === selected.id), [selected.id,projection.messages])
  const draft = projection.drafts[selected.id] ?? ''
  const syncError=saveErrorFor(syncErrors,projection.saveId)
  const turn=aiTurn(projection.saveId)
  const generating=generatingSaves.has(projection.saveId)||turn?.state==='queued'||turn?.state==='running'||turn?.state==='waiting-choice'

  // Preview data is intentionally ephemeral. Polling only forces a render while
  // a turn is active; it never persists raw model chunks into the story save.
  useEffect(()=>{
    if(!generating)return
    const timer=window.setInterval(()=>{setTurnRefresh(value=>value+1)},500)
    return()=>{window.clearInterval(timer)}
  },[generating,projection.saveId])

  const submit = (): void => {
    const text = draft.trim()
    if (text === ''||generating) return
    const submitted=appendPlayerMessage(projection,selected.id,text)
    const saveId=submitted.saveId
    persist(submitted)
    setProjection(submitted)
    setGeneratingSaves(current=>new Set(current).add(saveId))
    void sendToAI(submitted,selected.id,text).then(result=>{
      commitAiResult(saveId,selected.id,result,result.turnId,submitted)
    },error=>{setSaveSyncError(saveId,error instanceof Error?error.message:String(error))}).finally(()=>{
      setGeneratingSaves(current=>{const next=new Set(current);next.delete(saveId);return next})
    })
  }

  const cancelTurn=():void=>{const saveId=projection.saveId;void cancelAiTurn(saveId).then(()=>{setSaveSyncError(saveId,undefined);setGeneratingSaves(current=>{const next=new Set(current);next.delete(saveId);return next})},error=>{setSaveSyncError(saveId,error instanceof Error?error.message:String(error))})}
  const retryTurn=():void=>{if(generating)return;const retryProjection=projection;const saveId=retryProjection.saveId;setGeneratingSaves(current=>new Set(current).add(saveId));void retryAiTurn(retryProjection).then(result=>{const pending=aiTurn(saveId);commitAiResult(saveId,pending?.channelId??selected.id,result,result.turnId,retryProjection)},error=>{setSaveSyncError(saveId,error instanceof Error?error.message:String(error))}).finally(()=>{setGeneratingSaves(current=>{const next=new Set(current);next.delete(saveId);return next})})}

  const answerChoice = async (selectedLabels: string[], custom?: string): Promise<void> => {
    if (choiceCard === undefined) return
    setChoiceError(undefined)
    try{
      await choices.answer(choiceCard,selectedLabels,custom)
      const latest=storage.load(projection.saveId)??projection
      const channelId=latest.channels.some(channel=>channel.id===selected.id)?selected.id:latest.selectedChannelId
      const recorded=appendChoiceRecord(latest,channelId,choiceCard.id,selectedLabels,custom)
      persist(recorded)
      setProjection(current=>current.saveId===recorded.saveId?recorded:current)
      setChoiceCard(undefined)
    }catch(error){
      setChoiceError(error instanceof Error?error.message:String(error))
      throw error
    }
  }

  /** Continue an existing save: load its projection (host first, local cache fallback). */
  const continueGame = (saveId: string): void => {
    setHostReady(false)
    void (async () => {
      try {
        const remote = await hostStorage.load(saveId)
        const next = remote ?? storage.load(saveId)
        if (next === undefined) throw new Error(`找不到存档：${saveId}`)
        storage.save(next)
        choices.bindSave(saveId)
        setProjection(next)
        setView(state => ({ ...state, selectedChannelId: next.selectedChannelId, drafts: next.drafts }))
        setScreen('game')
        recoverPending(next)
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : String(error))
      }
    })()
  }

  /** Start a new game: mint a fresh save id and open the shell. */
  const newGame = (packId: string): void => {
    try{
      const pack=packs.find(item=>item.packId===packId)
      if(pack===undefined)throw new Error(`找不到内容包：${packId}`)
      const saveId = newSaveId(packId)
      const next = createNewGame(pack, saveId)
      storage.save(next)
      choices.bindSave(saveId)
      setProjection(next)
      setView(state => ({ ...state, selectedChannelId: next.selectedChannelId, drafts: next.drafts }))
      setHostReady(false)
      setScreen('game')
    }catch(error){setLibraryError(error instanceof Error?error.message:String(error))}
  }

  /** Back to the library from inside a game. */
  const backToLibrary = (): void => {
    setChoiceCard(undefined)
    choices.bindSave(null)
    setHostReady(false)
    setScreen('library')
  }

  /** Duplicate a save under a fresh id (save-as), then open the copy. */
  const saveAsGame = (saveId: string): void => {
    void (async () => {
      try {
        const source = await hostStorage.load(saveId)
        const fallback = storage.load(saveId)
        const base = source ?? fallback
        if (base === undefined) throw new Error(`找不到存档：${saveId}`)
        const copy = cloneSave(base, newSaveId(base.packId))
        await forkAiSession(base.saveId,copy.saveId,base.packId)
        storage.save(copy)
        await hostStorage.save(copy, true)
        choices.bindSave(copy.saveId)
        setProjection(copy)
        setView(state => ({ ...state, selectedChannelId: copy.selectedChannelId, drafts: copy.drafts }))
        setHostReady(false)
        setScreen('game')
        // Refresh the library list so the copy shows when returning.
        const list = await hostStorage.list().catch(() => undefined)
        if (list !== undefined) setSaves(list)
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : String(error))
      }
    })()
  }

  /** Delete a save (host + local cache); stays on the library. */
  const deleteSave = (saveId: string): void => {
    if (!window.confirm(`确定删除存档「${saveId}」吗？此操作不可撤销。`)) return
    void (async () => {
      try {
        await cancelAiTurn(saveId)
        await hostStorage.remove(saveId)
        await releaseAiSave(saveId,saves.find(save=>save.saveId===saveId)?.packId)
        // Clear the local cache copy if present.
        try { window.localStorage.removeItem(`dsh-story-save:${saveId}`) } catch { /* ignore */ }
        const list = await hostStorage.list()
        setSaves(list)
        setLibraryError(undefined)
      } catch (error) {
        setLibraryError(error instanceof Error ? error.message : String(error))
      }
    })()
  }

  // Esc returns to ordinary chat unless an IME composition is in progress.
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.isComposing) exitGame()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [active, exitGame])

  if (!active) return null

  if (screen === 'library') {
    return (
      <StoryGameLibrary
        packs={packs}
        saves={saves}
        onContinue={(saveId) => { continueGame(saveId) }}
        onNewGame={(packId) => { newGame(packId) }}
        onSaveAs={(saveId) => { saveAsGame(saveId) }}
        onDelete={(saveId) => { deleteSave(saveId) }}
        onExit={exitGame}
        error={libraryError}
      />
    )
  }

  const onToggle = (side: PanelSide): void => { setView(state => togglePanel(state, side)) }

  return (
    <div className={css.shell} role="dialog" aria-label="文字游戏" data-narrow={narrow}>
      <header className={css.topbar}>
        <div className={css.topbarToggle}>
          <button type="button" className={css.iconButton} onClick={() => { onToggle('left') }}
            aria-label={view.leftOpen ? '收起频道列表' : '展开频道列表'} aria-pressed={view.leftOpen}>
            <IconPanelLeftOutline16 size={16} />
          </button>
        </div>
        <div className={css.topbarTitle}>
          <span className={css.channelTitle}>{selected.title}</span>
          <span className={css.frameLabel}>
            {projection.frame.seasonLabel} · {projection.frame.episodeLabel} · {projection.frame.sceneLabel}
          </span>
        </div>
        <div className={css.topbarToggle}>
          <button type="button" className={css.iconButton} onClick={() => { onToggle('right') }}
            aria-label={view.rightOpen ? '收起详情面板' : '展开详情面板'} aria-pressed={view.rightOpen}>
            <IconPanelLeftOutline16 size={16} className={css.flipIcon} />
          </button>
          <button type="button" className={css.libraryButton} onClick={backToLibrary}>
            游戏库
          </button>
          <button type="button" className={css.backButton} onClick={exitGame}>
            <IconChevronLeftOutline14 size={14} />
            返回普通聊天
          </button>
        </div>
      </header>
      <div className={css.body}>
        {view.leftOpen ? (
          <nav className={css.channelPane} aria-label="频道列表">
            <div className={css.paneHeader}>{projection.packTitle}</div>
            <ul className={css.channelList}>
              {projection.channels.map(channel => {
                const last = projection.messages.filter(message=>message.channelId===channel.id).at(-1)
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      className={channel.id === selected.id ? css.channelItemActive : css.channelItem}
                      aria-current={channel.id === selected.id ? 'true' : undefined}
                      onClick={() => { setView(state => selectChannel(state, channel.id));setProjection(previous=>{const next={...previous,selectedChannelId:channel.id,revision:previous.revision+1,updatedAt:new Date().toISOString()};persist(next);return next}) }}
                    >
                      <span className={css.channelKind}>{kindLabel(channel.kind)}</span>
                      <span className={css.channelName}>{channel.title}</span>
                      <span className={css.channelLast}>{last === undefined ? '' : formatActivity(last.createdAt)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        ) : null}
        <main className={css.messagePane} aria-label="频道消息">
          <div className={css.messageList}>
            {channelMessages.map(message => (
              <MessageRow key={message.id} message={message} scene={selected.kind === 'scene'} participants={projection.participants} playerId={playerId} />
            ))}
            {turn?.preview?.channelId===selected.id ? (
              <section className={css.preview} aria-live="polite" aria-label="AI 临时预览">
                <div className={css.previewLabel}>AI 临时预览（尚未写入剧情）</div>
                {turn.preview.messages.map((message,index)=><MessageRow key={`${turn.preview!.turnId}-${index}`} message={{...message,id:`preview-${index}`,createdAt:'',senderId:message.senderId}} scene={selected.kind === 'scene'} participants={projection.participants} playerId={playerId} />)}
              </section>
            ) : null}
          </div>
          {syncError !== undefined ? <div className={css.turnError} role="alert">存档或 AI 回合错误：{syncError}</div> : null}
          <div className={css.composer}>
            <textarea
              className={css.input}
              value={draft}
              placeholder="输入对白；可使用 (行动) 或 (系统)"
              aria-label={`在 ${selected.title} 中输入`}
              onChange={event => {const text=event.target.value;setView(state=>setDraft(state,selected.id,text));setProjection(previous=>{const next=updateDraft(previous,selected.id,text);persist(next);return next})}}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            <button type="button" className={css.sendButton} onClick={submit} disabled={generating}>{generating?'生成中…':'发送'}</button>
            {generating ? <button type="button" className={css.cancelButton} onClick={cancelTurn}>取消</button> : null}
            {turn!==null&&(turn.state==='failed'||turn.state==='cancelled') ? <button type="button" className={css.retryButton} onClick={retryTurn}>重试</button> : null}
          </div>
          {turn?.error !== undefined ? <div className={css.turnError} role="alert">AI 回合失败：{turn.error}</div> : null}
        </main>
        {view.rightOpen ? (
          <aside className={css.detailPane} aria-label="频道详情">
            <div className={css.paneHeader}>频道信息</div>
            <div className={css.detailBody}>
              <div className={css.detailSection}>类型：{kindLabel(selected.kind)}</div>
              <div className={css.detailSection}>成员</div>
              <ul className={css.memberList}>
                {selected.participantIds.map(id => {
                  const participant = projection.participants.find(item=>item.id===id)
                  return (
                    <li key={id} className={css.memberItem}>
                      <span className={css.memberAvatar} aria-hidden="true">
                        {(participant?.heroNameZh ?? participant?.realNameZh ?? '？').slice(0, 1)}
                      </span>
                      <span>{participant === undefined ? id : participant.heroNameZh ?? participant.realNameZh}</span>
                    </li>
                  )
                })}
              </ul>
              <div className={css.detailSection}>当前位置</div>
              <div className={css.detailText}>{projection.frame.sceneLabel}</div>
              <div className={css.demoNote}>{syncError===undefined?'v0.8 Beta：频道、消息与草稿已保存到宿主本地存档。':`本地存档同步异常：${syncError}`}</div>
            </div>
          </aside>
        ) : null}
      </div>
      {choiceCard !== undefined ? (
        <ChoiceCard
          card={choiceCard}
          onAnswer={answerChoice}
        />
      ) : null}
      {choiceError !== undefined ? (
        <div className={css.choiceError} role="alert">{choiceError}</div>
      ) : null}
    </div>
  )
}

/** Render one structured mock message with the right visual class. */
function MessageRow({ message, scene, participants, playerId }: { message: {
  id: string
  senderId: string
  kind: StoryMessage['kind']
  content: string
  createdAt: string
}, scene: boolean, participants:StorySaveProjection['participants'],playerId:string|undefined }) {
  const sender = participants.find(participant=>participant.id===message.senderId)
  const name = sender === undefined ? message.senderId : sender.heroNameZh ?? sender.realNameZh
  if (message.kind === 'narration') {
    return <div className={css.narration}>{message.content}</div>
  }
  if (message.kind === 'system' || message.kind === 'work-dispatch' || message.kind === 'relationship' || message.kind === 'episode-summary') {
    return <div className={css.systemNote}>{message.content}</div>
  }
  if (message.kind === 'choice') {
    return <div className={css.choiceCard}>{message.content}</div>
  }
  const mine = message.senderId === playerId
  if (message.kind === 'action') {
    return <div className={mine ? css.actionMine : css.actionOther}>（{name}）{message.content}</div>
  }
  return (
    <div className={mine ? css.bubbleRowMine : css.bubbleRowOther}>
      {!mine && scene ? <span className={css.senderName}>{name}</span> : null}
      <div className={mine ? css.bubbleMine : css.bubbleOther}>{message.content}</div>
    </div>
  )
}

/** Chinese labels for the five channel kinds. */
function kindLabel(kind: 'direct' | 'group' | 'scene' | 'work' | 'system'): string {
  switch (kind) {
    case 'direct': return '私聊'
    case 'group': return '群聊'
    case 'scene': return '现场'
    case 'work': return '工作'
    case 'system': return '系统'
  }
}
function formatActivity(value:string):string{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}