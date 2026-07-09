import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import { z } from 'zod'

/** CopilotKit CUSTOM 事件名:writer 润色后的逐条修改说明 */
export const WRITER_CHANGE_SUMMARIES_EVENT = 'writer_change_summaries'

/**
 * 一个行级 diff hunk:以「行」为原子单位,相邻增删行合并成一个 block。
 * `from` 是 hunk 在**原文快照**中的起始偏移(字符级,非行号)。
 * server 与 client 共用同一份 `computeHunks`,保证两侧 hunk 划分一致,
 * 从而让 summary 能按 `hunkKey(from, originalText)` 精确对齐。
 */
export interface Hunk {
  from: number
  originalText: string
  newText: string
}

/** diff → 行级 hunk(以行为原子单位,相邻增删行合并成一个 block) */
export function computeHunks(oldText: string, newText: string): Hunk[] {
  const dmp = new DiffMatchPatch()
  const a = dmp.diff_linesToChars_(oldText, newText)
  const diffs = dmp.diff_main(a.chars1, a.chars2, false)
  dmp.diff_charsToLines_(diffs, a.lineArray)

  const hunks: Hunk[] = []
  let pos = 0
  let cur: Hunk | null = null
  for (const [op, text] of diffs) {
    if (op === 0) {
      if (cur) {
        hunks.push(cur)
        cur = null
      }
      pos += text.length
    }
    else {
      if (!cur)
        cur = { from: pos, originalText: '', newText: '' }
      if (op === -1) {
        cur.originalText += text
        pos += text.length
      }
      else {
        cur.newText += text
      }
    }
  }
  if (cur)
    hunks.push(cur)
  return hunks
}

/** hunk 稳定主键:起始偏移 + 原文片段。用于 MR 去重与 summary 对齐。 */
export function hunkKey(from: number, originalText: string): string {
  return `${from}:${originalText}`
}

export interface WriterChangeSummary {
  /** hunk 在原文快照中的起始偏移,与 client computeHunks 的 h.from 对齐 */
  hintFrom: number
  originalText: string
  newText: string
  summary: string
}

export const WriterChangeSummarySchema = z.object({
  hintFrom: z.number(),
  originalText: z.string(),
  newText: z.string(),
  summary: z.string(),
})

export const WriterChangeSummariesSchema = z.object({
  changes: z.array(WriterChangeSummarySchema),
})

/** summaryLlm 结构化输出:按 hunk 索引顺序返回每条修改说明 */
export const WriterHunkSummariesSchema = z.object({
  summaries: z.array(z.string()),
})
