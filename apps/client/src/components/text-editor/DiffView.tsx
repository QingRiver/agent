import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import { useMemo } from 'react'

interface DiffViewProps {
  originalText: string
  newText: string
}

interface LineOp { op: -1 | 0 | 1, text: string }
type Segment
  = | { type: 'equal', text: string }
    | { type: 'add', text: string }
    | { type: 'delete', text: string }
    | { type: 'modify', removed: string, added: string }

/** 行级 diff → 每行一个 {op, text} */
function lineDiff(oldText: string, newText: string): LineOp[] {
  const dmp = new DiffMatchPatch()
  const a = dmp.diff_linesToChars_(oldText, newText)
  const diffs = dmp.diff_main(a.chars1, a.chars2, false)
  dmp.diff_charsToLines_(diffs, a.lineArray)
  const ops: LineOp[] = []
  for (const [op, text] of diffs) {
    const lns = text.split('\n')
    if (text.endsWith('\n'))
      lns.pop()
    for (const ln of lns)
      ops.push({ op: op as -1 | 0 | 1, text: ln })
  }
  return ops
}

/** 行级 ops → 段:equal / 纯增 / 纯删 / 修改(删+增配对) */
function groupSegments(ops: LineOp[]): Segment[] {
  const segs: Segment[] = []
  let i = 0
  while (i < ops.length) {
    const { op } = ops[i]
    if (op === 0) {
      const lines: string[] = []
      while (i < ops.length && ops[i].op === 0) {
        lines.push(ops[i].text)
        i++
      }
      segs.push({ type: 'equal', text: lines.join('\n') })
    }
    else if (op === -1) {
      const removed: string[] = []
      while (i < ops.length && ops[i].op === -1) {
        removed.push(ops[i].text)
        i++
      }
      const added: string[] = []
      while (i < ops.length && ops[i].op === 1) {
        added.push(ops[i].text)
        i++
      }
      if (added.length > 0)
        segs.push({ type: 'modify', removed: removed.join('\n'), added: added.join('\n') })
      else
        segs.push({ type: 'delete', text: removed.join('\n') })
    }
    else {
      const added: string[] = []
      while (i < ops.length && ops[i].op === 1) {
        added.push(ops[i].text)
        i++
      }
      segs.push({ type: 'add', text: added.join('\n') })
    }
  }
  return segs
}

function wordDiff(a: string, b: string): [number, string][] {
  const dmp = new DiffMatchPatch()
  const d = dmp.diff_main(a, b)
  dmp.diff_cleanupSemantic(d)
  return d as [number, string][]
}

/** 整行块:每行一个 div,整行背景染色 */
function LineBlock({ text, className }: { text: string, className: string }) {
  return (
    <>
      {text.split('\n').map((ln, i) => (
        <div key={i} className={`whitespace-pre-wrap break-words px-2 ${className}`}>
          {ln === '' ? ' ' : ln}
        </div>
      ))}
    </>
  )
}

/**
 * Claude Code 风格的统一 inline diff(单文本,红绿集中):
 * - 纯增行 → 整行绿底;纯删行 → 整行红底+删除线
 * - 修改(删+增配对):相似度高(部分/单词改动)→ 只 inline 高亮变更词(红删+绿增);
 *   相似度低(整行重写)→ 按整行红底+整行绿底处理
 */
export function DiffView({ originalText, newText }: DiffViewProps) {
  const segments = useMemo(
    () => groupSegments(lineDiff(originalText, newText)),
    [originalText, newText],
  )

  return (
    <div className="space-y-0.5 rounded-lg border border-slate-800 bg-[#0b1220] p-2 font-mono text-sm leading-relaxed">
      {originalText === '' && newText === '' && (
        <div className="px-2 py-1 text-slate-600">
          （空内容）
        </div>
      )}
      {segments.map((seg, i) => {
        if (seg.type === 'equal')
          return <LineBlock key={i} text={seg.text} className="text-slate-500" />
        if (seg.type === 'add')
          return <LineBlock key={i} text={seg.text} className="bg-emerald-500/20 text-emerald-200" />
        if (seg.type === 'delete')
          return <LineBlock key={i} text={seg.text} className="bg-red-500/20 text-red-200 line-through" />
        // modify:按相似度决定 inline 词高亮 vs 整行染色
        const wd = wordDiff(seg.removed, seg.added)
        const eqLen = wd.filter(([op]) => op === 0).reduce((s, [, t]) => s + t.length, 0)
        const similar = eqLen / Math.max(seg.removed.length, seg.added.length, 1)
        if (similar < 0.4) {
          // 整行重写:红底旧行 + 绿底新行
          return (
            <div key={i}>
              <LineBlock text={seg.removed} className="bg-red-500/20 text-red-200 line-through" />
              <LineBlock text={seg.added} className="bg-emerald-500/20 text-emerald-200" />
            </div>
          )
        }
        // 部分/单词改动:红绿集中在同一文本流,只高亮变更词
        return (
          <div key={i} className="whitespace-pre-wrap break-words px-2">
            {wd.map(([op, text], j) => (
              <span
                key={j}
                className={
                  op === -1
                    ? 'rounded bg-red-500/30 text-red-200 line-through'
                    : op === 1
                      ? 'rounded bg-emerald-500/30 text-emerald-200'
                      : 'text-slate-300'
                }
              >
                {text}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
