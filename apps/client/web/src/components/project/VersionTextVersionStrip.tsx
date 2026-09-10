import type { VersionTextRow } from '@apis/skill-api'
import { FileEdit } from 'lucide-react'

function formatTs(iso: string | null | undefined): string | null {
  if (!iso)
    return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime()))
    return null
  return d.toLocaleString('zh-CN', { hour12: false })
}

interface VersionTextVersionStripProps {
  draft: VersionTextRow | null
  published: VersionTextRow[]
  activeVersion: number
  onSelectDraft: () => void
  onSelectVersion: (version: number) => void
}

/** 文本详情左侧窄条：草稿置顶 + 已发布版本 */
export function VersionTextVersionStrip({
  draft,
  published,
  activeVersion,
  onSelectDraft,
  onSelectVersion,
}: VersionTextVersionStripProps) {
  const draftActive = activeVersion === 0

  return (
    <div className="flex h-full w-[180px] shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        <button
          type="button"
          onClick={onSelectDraft}
          className={`relative w-full rounded-md border p-2.5 text-left transition-colors ${
            draftActive
              ? 'border-sky-200 bg-sky-50 shadow-sm dark:border-sky-800 dark:bg-sky-950/40'
              : 'border-dashed border-border bg-background hover:border-sky-300 hover:bg-sky-50/50 dark:hover:bg-sky-950/20'
          }`}
        >
          <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${
            draftActive ? 'text-sky-700 dark:text-sky-300' : 'text-foreground'
          }`}
          >
            <FileEdit className="size-3 shrink-0" />
            当前草稿
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {draft ? (formatTs(draft.updatedAt) ?? '可编辑') : '加载中…'}
          </span>
          {draftActive && (
            <span className="absolute right-2 top-2 size-1.5 animate-pulse rounded-full bg-sky-500" />
          )}
        </button>

        {published.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 py-0.5">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-medium text-muted-foreground">已发布</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {published.map((record, index) => {
              const isActive = activeVersion === record.version
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onSelectVersion(record.version)}
                  className={`relative w-full rounded-md border p-2.5 text-left transition-colors ${
                    isActive
                      ? 'border-sky-200 bg-background shadow-sm ring-1 ring-sky-100 dark:border-sky-800 dark:ring-sky-900'
                      : 'border-transparent bg-transparent hover:border-border hover:bg-muted/60'
                  }`}
                >
                  <div className="mb-0.5 flex items-center justify-between gap-1">
                    <span className={`text-[13px] font-semibold ${
                      isActive ? 'text-sky-700 dark:text-sky-300' : 'text-foreground'
                    }`}
                    >
                      {`v${record.version}`}
                    </span>
                    {index === 0 && (
                      <span className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[10px] font-bold leading-none text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        LATEST
                      </span>
                    )}
                  </div>
                  <div
                    className="mb-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground"
                    title={record.versionDesc ?? undefined}
                  >
                    {record.versionDesc?.trim() || '暂无描述'}
                  </div>
                  {formatTs(record.publishedAt) && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatTs(record.publishedAt)}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
