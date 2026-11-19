import type { EditorEditCase } from '@agent/proto'
import type { LangGraphRunnableConfig } from '@langchain/langgraph'
import type { EditorFocus } from './types'

export function resolveEditCase(config: LangGraphRunnableConfig): EditorEditCase {
  const raw = config.configurable?.editCase
  if (raw === 'inline' || raw === 'document')
    return raw
  const writerMode = config.configurable?.writerMode
  return writerMode === 'inline' ? 'inline' : 'document'
}

export function readFocuses(config: LangGraphRunnableConfig): EditorFocus[] {
  const raw = config.configurable?.focuses
  if (!Array.isArray(raw))
    return []
  const out: EditorFocus[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object')
      continue
    const rec = item as Record<string, unknown>
    const text = typeof rec.text === 'string' ? rec.text : ''
    if (!text.trim())
      continue
    const focus: EditorFocus = { text }
    if (typeof rec.from === 'number')
      focus.from = rec.from
    if (typeof rec.to === 'number')
      focus.to = rec.to
    out.push(focus)
  }
  return out
}

export function readOptionalString(config: LangGraphRunnableConfig, key: string): string {
  const v = config.configurable?.[key]
  return typeof v === 'string' ? v : ''
}
