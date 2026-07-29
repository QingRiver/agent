import type { TagRow } from '@apis/tags-api'
import { TagManager } from '@components/tags/TagManager'
import { Checkbox } from '@components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { Check, ChevronDown, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

interface KbDocTagsBarProps {
  tagIds: string[]
  allTags: TagRow[]
  onChangeTagIds: (tagIds: string[]) => Promise<void>
}

function TagChip({ name, color }: { name: string, color?: string | null }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ring-border"
      style={color ? { backgroundColor: `${color}33`, color, borderColor: color } : undefined}
    >
      {name}
    </span>
  )
}

/** 换文档时由父组件 key=docId remount，重置编辑态 */
export function KbDocTagsBar({
  tagIds,
  allTags,
  onChangeTagIds,
}: KbDocTagsBarProps) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const tagById = (id: string) => allTags.find(t => t.id === id)

  async function toggleTag(id: string) {
    if (busy)
      return
    const selected = new Set(tagIds)
    if (selected.has(id))
      selected.delete(id)
    else
      selected.add(id)
    setBusy(true)
    try {
      await onChangeTagIds([...selected])
    }
    finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex w-full flex-wrap items-center gap-1.5">
        {tagIds.length === 0 && (
          <span className="text-xs text-muted-foreground">无标签</span>
        )}
        {tagIds.map((id) => {
          const meta = tagById(id)
          return <TagChip key={id} name={meta?.name ?? id} color={meta?.color} />
        })}
        <button
          type="button"
          onClick={() => {
            setEditing(true)
            setOpen(true)
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="编辑标签"
        >
          <Pencil className="size-3" />
          编辑
        </button>
      </div>
    )
  }

  const selected = new Set(tagIds)

  return (
    <div className="flex w-full items-stretch gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            className="flex min-h-8 w-full min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-left text-xs text-foreground outline-none hover:bg-accent/40 disabled:opacity-50"
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {tagIds.length === 0
                ? (
                    <span className="text-muted-foreground">选择标签</span>
                  )
                : tagIds.map((id) => {
                    const meta = tagById(id)
                    return <TagChip key={id} name={meta?.name ?? id} color={meta?.color} />
                  })}
            </span>
            <ChevronDown className="size-3.5 shrink-0 self-center text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-1"
        >
          <div className="max-h-56 overflow-y-auto py-0.5">
            {allTags.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                暂无可用标签
              </p>
            )}
            {allTags.map((tag) => {
              const on = selected.has(tag.id)
              return (
                <label
                  key={tag.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-accent"
                >
                  <Checkbox
                    checked={on}
                    disabled={busy}
                    onCheckedChange={() => void toggleTag(tag.id)}
                  />
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-border"
                    style={tag.color
                      ? { backgroundColor: tag.color, borderColor: tag.color }
                      : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                </label>
              )
            })}
          </div>
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setManagerOpen(true)
              }}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              增加
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        onClick={() => {
          setEditing(false)
          setOpen(false)
        }}
        className="inline-flex shrink-0 items-center gap-1 self-stretch rounded-md border border-border bg-background px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Check className="size-3" />
        完成
      </button>

      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  )
}
