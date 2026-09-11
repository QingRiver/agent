import type { TagRow } from '@apis/tags-api'
import { Badge } from '@components/ui/badge'
import { Input } from '@components/ui/input'
import { cn } from '@lib/utils'

export interface ResourceRow {
  id: string
  name: string
  description: string
  tagIds: string[]
  mountPath: string
}

interface ResourcesTableProps {
  rows: ResourceRow[]
  tagsById: Map<string, TagRow>
  emptyText?: string
  onRowClick?: (row: ResourceRow) => void
}

export function ResourcesTable({
  rows,
  tagsById,
  emptyText = '暂无数据',
  onRowClick,
}: ResourcesTableProps) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-border bg-background">
          <tr className="text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">名称</th>
            <th className="px-4 py-2 font-medium">描述</th>
            <th className="px-4 py-2 font-medium">标签</th>
            <th className="px-4 py-2 font-medium">挂载路径</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const clickable = onRowClick != null
            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-border/60',
                  clickable && 'cursor-pointer hover:bg-accent/50',
                )}
                onClick={clickable ? () => onRowClick(row) : undefined}
                onKeyDown={clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined}
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'link' : undefined}
              >
                <td className="max-w-[12rem] truncate px-4 py-2.5 font-medium text-foreground">
                  {row.name}
                </td>
                <td className="max-w-[20rem] truncate px-4 py-2.5 text-muted-foreground">
                  {row.description || '—'}
                </td>
                <td className="px-4 py-2.5">
                  {row.tagIds.length === 0
                    ? <span className="text-muted-foreground">—</span>
                    : (
                        <div className="flex flex-wrap gap-1">
                          {row.tagIds.map((id) => {
                            const tag = tagsById.get(id)
                            if (!tag)
                              return null
                            return (
                              <Badge
                                key={id}
                                variant="outline"
                                className="max-w-[8rem] truncate"
                                style={tag.color
                                  ? { borderColor: tag.color, color: tag.color }
                                  : undefined}
                              >
                                {tag.name}
                              </Badge>
                            )
                          })}
                        </div>
                      )}
                </td>
                <td className="max-w-[16rem] truncate px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {row.mountPath || '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ResourcesToolbar({
  q,
  onQChange,
  tags,
  selectedTagIds,
  onToggleTag,
  showTagFilter,
}: {
  q: string
  onQChange: (q: string) => void
  tags: TagRow[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
  showTagFilter: boolean
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
      <Input
        value={q}
        onChange={e => onQChange(e.target.value)}
        placeholder="按名称搜索…"
        className="max-w-sm"
      />
      {showTagFilter && tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const on = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
                  on ? 'ring-2 ring-sky-400' : 'ring-border'
                }`}
                style={tag.color
                  ? { backgroundColor: `${tag.color}22`, color: tag.color }
                  : undefined}
              >
                {tag.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
