import type { WriterChangeSummary } from '@agent/proto'
import { computeHunks, WriterHunkSummariesSchema } from '@agent/proto'
import { SUMMARY_SYSTEM_PROMPT } from '../../prompts/editorPrompts'
import { structuredCompletion } from '../../utils/structuredCompletion'

export async function summarizeHunks(original: string, polished: string): Promise<WriterChangeSummary[]> {
  const hunks = computeHunks(original, polished).filter(h => h.originalText || h.newText)
  if (!hunks.length)
    return []
  const payload = hunks.map((h, i) => ({
    index: i,
    originalText: h.originalText || '(纯插入)',
    newText: h.newText || '(纯删除)',
  }))
  const parsed = await structuredCompletion({
    system: SUMMARY_SYSTEM_PROMPT,
    user: JSON.stringify(payload, null, 2),
    schema: WriterHunkSummariesSchema,
    temperature: 0,
  })
  const summaries = parsed?.summaries ?? []
  return hunks.map((h, i) => ({
    hintFrom: h.from,
    originalText: h.originalText,
    newText: h.newText,
    summary: summaries[i]?.trim() ?? '',
  }))
}
