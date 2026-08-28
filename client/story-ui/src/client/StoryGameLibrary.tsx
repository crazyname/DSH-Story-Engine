/**
 * Game library screen: installed packs with their saves, continue / new game.
 *
 * Shown when the player enters game mode with no save selected (or returns
 * from the shell). Each pack lists its existing saves (continue) and offers a
 * new-game button; packs with no save show only the new-game entry.
 */
import type { SaveSummary } from './host-persistence.ts'
import type { StoryPack } from './game-library.ts'
import { groupSavesBySaveId, formatUpdated } from './library-format.ts'
import css from './StoryGameLibrary.module.css'

export interface StoryGameLibraryProps {
  packs: readonly StoryPack[]
  saves: readonly SaveSummary[]
  /** Continue an existing save. */
  onContinue(saveId: string): void
  /** Start a new game for a pack. */
  onNewGame(packId: string): void
  /** Duplicate an existing save under a new id. */
  onSaveAs(saveId: string): void
  /** Delete an existing save. */
  onDelete(saveId: string): void
  /** Return to ordinary chat. */
  onExit(): void
  /** Optional library-level error (e.g. host list unavailable). */
  error?: string
}

export function StoryGameLibrary({ packs, saves, onContinue, onNewGame, onSaveAs, onDelete, onExit, error }: StoryGameLibraryProps) {
  const bySave = groupSavesBySaveId(saves)
  return (
    <div className={css.library} role="dialog" aria-label="游戏库">
      <header className={css.header}>
        <div className={css.headerTitle}>
          <span className={css.logo}>文字游戏</span>
          <span className={css.tagline}>游戏库</span>
        </div>
        <button type="button" className={css.exit} onClick={onExit}>返回普通聊天</button>
      </header>
      <div className={css.body}>
        {error !== undefined && <div className={css.error} role="alert">{error}</div>}
        <div className={css.packList}>
          {packs.map((pack) => {
            const packSaves = bySave.get(pack.packId) ?? []
            return (
              <section key={pack.packId} className={css.pack}>
                <div className={css.packHead}>
                  <div className={css.packMeta}>
                    <h2 className={css.packTitle}>{pack.title}</h2>
                    <div className={css.packInfo}>
                      <span>{pack.author}</span>
                      <span>v{pack.version}</span>
                      {pack.status === 'diagnostic' && <span className={css.badge}>需诊断</span>}
                    </div>
                  </div>
                  <button type="button" className={css.newGame} disabled={pack.status!=='ready'} title={pack.diagnostic} onClick={() => { onNewGame(pack.packId) }}>
                    {pack.status==='ready'?'新游戏':'待配置'}
                  </button>
                </div>
                <p className={css.packDesc}>{pack.description}</p>
                {pack.diagnostic!==undefined&&<p className={css.empty}>{pack.diagnostic}</p>}
                {packSaves.length > 0 ? (
                  <ul className={css.saveList}>
                    {packSaves.map((save) => (
                      <li key={save.saveId} className={css.saveItem}>
                        <div className={css.saveRowWrap}>
                          <button type="button" className={css.saveRow} onClick={() => { onContinue(save.saveId) }}>
                            <span className={css.saveName}>{save.packTitle} · {formatUpdated(save.updatedAt)}</span>
                            <span className={css.saveMeta}>
                              {save.sceneLabel !== '' ? save.sceneLabel : `进度 ${save.revision}`}
                            </span>
                            <span className={css.saveAction}>继续游戏</span>
                          </button>
                          <div className={css.saveOps}>
                            <button type="button" className={css.opButton} onClick={() => { onSaveAs(save.saveId) }}>另存为</button>
                            <button type="button" className={css.opDanger} onClick={() => { onDelete(save.saveId) }}>删除</button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={css.empty}>暂无存档，点"新游戏"开始。</p>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
