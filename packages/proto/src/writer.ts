import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import { z } from 'zod'

/** LangGraph custom 事件名：与 propose_document_edits 成功载荷同形 */
export const WRITER_CHANGE_SUMMARIES_EVENT = 'writer_change_summaries'

/** Document 改稿：模型以 SEARCH/REPLACE 工具参数提交补丁 */
export const PROPOSE_DOCUMENT_EDITS_TOOL_NAME = 'propose_document_edits'

/** 对话/checkpoint 中允许展示的短说明（与 custom/tool 载荷分离） */
export const DOCUMENT_WRITING_NOTE = '编写中…'
export const DOCUMENT_ASSISTANT_NOTE = '已提出修订，请在对话卡片或正文红绿预览中审阅。'

export const DocumentEditPatchSchema = z.object({
  search: z.string().describe('原文中必须唯一出现的片段'),
  replace: z.string().describe('替换后的文本；空字符串表示删除'),
})
export type DocumentEditPatch = z.infer<typeof DocumentEditPatchSchema>

export const ProposeDocumentEditsArgsSchema = z.object({
  edits: z.array(DocumentEditPatchSchema).min(1).describe('按顺序套用的 SEARCH/REPLACE 补丁'),
})
export type ProposeDocumentEditsArgs = z.infer<typeof ProposeDocumentEditsArgsSchema>

export type ApplyDocumentEditsResult
  = | { ok: true, polished: string }
    | { ok: false, error: string }

/**
 * 按序将 SEARCH/REPLACE 套用到 baseline。每条 search 必须恰好出现一次。
 */
export function applyDocumentEdits(
  baseline: string,
  edits: readonly DocumentEditPatch[],
): ApplyDocumentEditsResult {
  if (edits.length === 0)
    return { ok: false, error: '没有可应用的修订' }

  let text = baseline
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!
    const search = edit.search
    if (search === '')
      return { ok: false, error: `第 ${i + 1} 条补丁的 search 为空` }

    const first = text.indexOf(search)
    if (first < 0)
      return { ok: false, error: `第 ${i + 1} 条补丁在文稿中找不到唯一原文` }

    const second = text.indexOf(search, first + search.length)
    if (second >= 0)
      return { ok: false, error: `第 ${i + 1} 条补丁的原文在文稿中出现多次，请缩小 search 范围` }

    text = text.slice(0, first) + edit.replace + text.slice(first + search.length)
  }

  if (text === baseline)
    return { ok: false, error: '修订后文稿与原文相同' }

  return { ok: true, polished: text }
}

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

/** 成功提案正文（custom 与 tool result 成功分支共用） */
export const WriterProposalPayloadSchema = z.object({
  baseline: z.string(),
  polished: z.string().min(1),
  changes: z.array(WriterChangeSummarySchema),
})
export type WriterProposalPayload = z.infer<typeof WriterProposalPayloadSchema>

/** propose_document_edits 的 ToolMessage 载荷（对话 diff 卡读取） */
export const ProposeDocumentEditsResultSchema = z.discriminatedUnion('ok', [
  WriterProposalPayloadSchema.extend({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.string(),
  }),
])
export type ProposeDocumentEditsResult = z.infer<typeof ProposeDocumentEditsResultSchema>

/**
 * 从 custom payload / tool result / 宽松 JSON 抽出成功提案。
 * custom 事件与 ToolMessage 成功分支同一真相源。
 */
export function parseWriterProposal(raw: unknown): WriterProposalPayload | null {
  if (raw == null)
    return null
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    }
    catch {
      return null
    }
  }
  const asResult = ProposeDocumentEditsResultSchema.safeParse(value)
  if (asResult.success) {
    if (!asResult.data.ok)
      return null
    const { baseline, polished, changes } = asResult.data
    return { baseline, polished, changes }
  }

  const asPayload = WriterProposalPayloadSchema.safeParse(value)
  return asPayload.success ? asPayload.data : null
}

/** custom 事件 `{ name, payload }` → 成功提案 */
export function parseWriterCustomEvent(data: unknown): WriterProposalPayload | null {
  if (data == null || typeof data !== 'object')
    return null
  const event = data as { name?: unknown, payload?: unknown }
  if (event.name !== WRITER_CHANGE_SUMMARIES_EVENT)
    return null
  return parseWriterProposal(event.payload)
}

/** summaryLlm 结构化输出:按 hunk 索引顺序返回每条修改说明 */
export const WriterHunkSummariesSchema = z.object({
  summaries: z.array(z.string()),
})

/** editorChat 意图分类 */
export const EditorChatIntentSchema = z.object({
  intent: z.enum(['ask', 'write']),
})
export type EditorChatIntent = z.infer<typeof EditorChatIntentSchema>['intent']

export type EditorEditCase = 'inline' | 'document'
