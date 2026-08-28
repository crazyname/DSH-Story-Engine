/**
 * Game-side choice card for story_present_choice.
 *
 * Rendered inside the game shell when the AI asks the player to choose (the
 * `question/requested` mux frame from the choice bridge). Clicking an option
 * answers through the bridge; free-text input is also offered because the
 * tool allows custom answers. Styling mirrors the shell's card language.
 */
import { useState } from 'react'
import type { StoryChoiceCard } from './choice-bridge.ts'
import css from './ChoiceCard.module.css'

export interface ChoiceCardProps {
  card: StoryChoiceCard
  /** Answer with one or more selected option labels; custom is optional free text. */
  onAnswer(selected: string[], custom?: string): Promise<void>
}

export function ChoiceCard({ card, onAnswer }: ChoiceCardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const single = card.multiSelect !== true

  const toggle = (label: string): void => {
    setSelected((prev) => single
      ? [label]
      : prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label])
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const chosen = [...selected]
    const text = custom.trim()
    if (chosen.length === 0 && text === '') return
    setBusy(true)
    try {
      await onAnswer(chosen, text === '' ? undefined : text)
    } catch {
      // The shell owns the visible error state; keep this event promise handled.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.overlay}>
      <div className={css.card} role="dialog" aria-label="剧情选择">
        <div className={css.headerRow}>
          {card.header !== undefined && <div className={css.eyebrow}>{card.header}</div>}
        </div>
        <div className={css.question}>{card.question}</div>
        {card.detail !== undefined && <div className={css.detail}>{card.detail}</div>}
        <div className={css.options} role={single ? 'radiogroup' : 'group'}>
          {card.options.map((option) => {
            const active = selected.includes(option.label)
            return (
              <button
                key={option.label}
                type="button"
                className={active ? css.optionActive : css.option}
                role={single ? 'radio' : 'checkbox'}
                aria-checked={active}
                onClick={() => { toggle(option.label) }}
              >
                <span className={css.optionLabel}>{option.label}</span>
                {option.description !== undefined && <span className={css.optionDesc}>{option.description}</span>}
              </button>
            )
          })}
        </div>
        <div className={css.composer}>
          <input
            className={css.input}
            value={custom}
            placeholder="或自由输入你的回答…"
            aria-label="自由输入回答"
            onChange={(event) => { setCustom(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit() }
            }}
          />
          <button type="button" className={css.send} onClick={submit} disabled={busy || (selected.length === 0 && custom.trim() === '')}>
            {busy ? '提交中…' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
