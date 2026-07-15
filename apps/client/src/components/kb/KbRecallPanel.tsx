import type { KbQueryResult } from '@apis/kb-api'
import type { FormEvent } from 'react'
import { KB_DEFAULT_ID, KbApi } from '@apis/kb-api'
import { Button } from '@components/ui/button'
import { Loader2, Search, X } from 'lucide-react'
import { useState } from 'react'

interface KbRecallPanelProps {
  onClose: () => void
}

export function KbRecallPanel({ onClose }: KbRecallPanelProps) {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<KbQueryResult | null>(null)
  const [enableRerank, setEnableRerank] = useState(true)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const query = q.trim()
    if (!query || loading)
      return
    setLoading(true)
    setError(null)
    try {
      const next = await KbApi.query(KB_DEFAULT_ID, query, { skipRerank: !enableRerank })
      setResult(next)
    }
    catch (err) {
      setResult(null)
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950/80">
      <div className="flex items-center gap-2 border-b border-slate-800 p-3">
        <Search className="size-4 text-slate-400" />
        <span className="flex-1 text-sm font-medium text-slate-200">召回测试</span>
        <button
          type="button"
          title="关闭"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="size-4" />
        </button>
      </div>

      <p className="border-b border-slate-800 px-3 py-2 text-xs text-slate-500">
        仅检索
        <span className="text-slate-400">已提交</span>
        内容；未提交的草稿不会命中。
      </p>

      <form onSubmit={e => void onSubmit(e)} className="flex gap-2 border-b border-slate-800 p-3">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="输入查询，如 SKU-9001…"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500"
        />
        <Button type="submit" size="sm" disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : '查询'}
        </Button>
      </form>

      <label className="flex items-center gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={enableRerank}
          onChange={e => setEnableRerank(e.target.checked)}
          className="size-3.5 accent-sky-500"
        />
        启用 rerank
        <span className="text-slate-600">（关闭则仅 RRF 直出，更快，用于测试/自验）</span>
      </label>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && (
          <p className="mb-2 text-sm text-red-400">{error}</p>
        )}
        {result && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              命中
              {' '}
              {result.chunks.length}
              {' '}
              条
              {result.fallback ? '（含 LLM fallback）' : ''}
            </p>
            {result.chunks.length === 0 && (
              <p className="text-sm text-slate-500">无结果。确认文档已提交且关键词能对上。</p>
            )}
            {result.chunks.map(chunk => (
              <article
                key={chunk.chunk_id || `${chunk.source_doc_id}:${chunk.raw_text.slice(0, 24)}`}
                className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {chunk.rank != null && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                      #
                      {chunk.rank}
                    </span>
                  )}
                  {chunk.score != null && (
                    <span>
                      score
                      {' '}
                      {chunk.score.toFixed(3)}
                    </span>
                  )}
                  {chunk.rerank_score != null && (
                    <span>
                      rerank
                      {' '}
                      {chunk.rerank_score.toFixed(3)}
                    </span>
                  )}
                  <span className="truncate font-mono" title={chunk.source_doc_id}>
                    {chunk.source_doc_id.slice(0, 8)}
                    …
                  </span>
                </div>
                {chunk.heading_path.length > 0 && (
                  <p className="mb-1 truncate text-xs text-sky-400/80">
                    {chunk.heading_path.join(' / ')}
                  </p>
                )}
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-300">
                  {chunk.raw_text}
                </pre>
              </article>
            ))}
          </div>
        )}
        {!result && !error && !loading && (
          <p className="text-sm text-slate-500">提交文档后在此试检索。</p>
        )}
      </div>
    </aside>
  )
}
