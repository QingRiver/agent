import type {
  EntityRef,
  FilterNode,
  Perspective,
  PerspectiveInput,
  TemporalValue,
} from '@agent/gtd'
import type { ComponentProps } from 'react'
import {
  allowedOpsForField,
  appendToLogicChain,
  BUILTIN_PERSPECTIVE_ID,
  builtinPerspectives,
  FILTER_FIELD,
  FILTER_FIELD_OPS,
  FILTER_FIELD_TEXT,
  flattenSameLogicChain,
  foldLogic,
  GROUP_KEY,
  GROUP_KEY_TEXT,
  LEAF_OP,
  LEAF_OP_TEXT,
  LOGIC_OP,
  LOGIC_OP_TEXT,
  setLogicChainOp,
  SORT_DIR,
  SORT_FIELD,
  SORT_FIELD_TEXT,
  toBinaryFilterTree,
} from '@agent/gtd'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Select } from '@components/ui/select'
import { cn } from '@lib/utils'
import { DirStore } from '@stores/dir-store'
import { TagsStore } from '@stores/tags-store'
import { useAtomValue } from 'jotai'
import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

// ---------- 持久值 ↔ 输入值 转换 ----------

function temporalInput(iso: string): TemporalValue {
  return { type: 'absolute', value: iso }
}

/** 已持久化（resolved）filter 树 → 编辑器输入形态（EntityRef / TemporalValue） */
function filterToInput(node: FilterNode | null): FilterNode | null {
  if (node == null)
    return null
  switch (node.op) {
    case LOGIC_OP.AND:
    case LOGIC_OP.OR:
      return { op: node.op, children: node.children.map(filterToInput) as FilterNode[] }
    case LOGIC_OP.NOT:
      return { op: node.op, child: filterToInput(node.child) as FilterNode }
    default: {
      const v = node.value
      if (node.op === LEAF_OP.SOME) {
        const ids = Array.isArray(v) ? v : []
        return { op: node.op, field: node.field, value: ids.map(id => ({ id: String(id) })) }
      }
      if (node.op === LEAF_OP.BEFORE || node.op === LEAF_OP.AFTER) {
        return { op: node.op, field: node.field, value: temporalInput(String(v)) }
      }
      if (node.op === LEAF_OP.WITHIN) {
        if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string') {
          const from = temporalInput(String(v[0]))
          const to = temporalInput(String(v[1]))
          return { op: node.op, field: node.field, value: [from, to] }
        }
        return node
      }
      return node
    }
  }
}

// ---------- 默认值 ----------

function defaultLeaf(field: string = FILTER_FIELD.STATUS): FilterNode {
  const op = FILTER_FIELD_OPS[field as keyof typeof FILTER_FIELD_OPS]?.[0] ?? LEAF_OP.IS
  return { op, field, value: defaultValueFor(field, op) } as FilterNode
}

function defaultValueFor(field: string, op: string): unknown {
  if (op === LEAF_OP.EMPTY || op === LEAF_OP.EXIST)
    return undefined
  if (field === FILTER_FIELD.STATUS)
    return 'active'
  if (field === FILTER_FIELD.FLAGGED)
    return true
  if (field === FILTER_FIELD.ESTIMATE)
    return op === LEAF_OP.WITHIN ? [0, 60] : 30
  if (field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE) {
    const t = temporalInput(new Date().toISOString())
    return op === LEAF_OP.WITHIN ? [t, t] : t
  }
  return [{ id: '' }]
}

function defaultBinaryAnd(): FilterNode {
  return foldLogic(LOGIC_OP.AND, [defaultLeaf(), defaultLeaf(FILTER_FIELD.FLAGGED)])
}

// ---------- 初始化 ----------

function initialInput(perspective?: Perspective): PerspectiveInput {
  if (!perspective) {
    return {
      name: '',
      icon: null,
      filter: null,
      groupBy: [],
      sortBy: [{ field: SORT_FIELD.ORDER, dir: SORT_DIR.ASC }],
    }
  }
  const filter = perspective.filter == null
    ? null
    : filterToInput(toBinaryFilterTree(perspective.filter))
  return {
    name: perspective.name,
    icon: perspective.icon,
    filter,
    groupBy: perspective.groupBy,
    sortBy: perspective.sortBy,
  }
}

function entitiesForField(field: string, projects: Array<{ id: string, name: string }>, tags: Array<{ id: string, name: string }>): Array<{ id: string, name: string }> {
  if (field === FILTER_FIELD.PROJECT)
    return projects
  return tags
}

// ---------- pill 视觉（hover / focus 统一用边框加深，不用绿色 ring） ----------

/** 字段 / 关系 / 值共用：idle·hover·focus 只改边框灰度，不用 ring */
const pillChrome = 'rounded-md border border-border/70 bg-background shadow-none transition-colors hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0'
const pillBase = `inline-flex h-8 items-center gap-1 px-2 text-sm ${pillChrome}`
const pillMuted = 'text-muted-foreground'
const conjPill = `inline-flex h-7 min-w-10 items-center justify-center bg-muted/50 px-2 text-xs font-medium text-foreground/80 hover:bg-muted ${pillChrome}`
/** 条件链中间的且/或：黄字黄边，与「非」红边呼应 */
const chainConjPill = `inline-flex h-7 min-w-10 items-center justify-center border-amber-500 bg-amber-500/10 px-2 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-400 ${pillChrome}`

/** 表达式内值控件：与字段/关系 pill 同套边框，避免 Select/Input 默认绿 ring */
function PillSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative inline-flex min-w-0 max-w-48', className)}>
      <select
        className={cn(
          pillChrome,
          'h-8 w-full min-w-18 appearance-none py-0 pl-2 pr-7 text-sm text-foreground',
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-1.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

function PillInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <Input
      className={cn(
        pillChrome,
        'h-8 min-w-0 max-w-48 px-2 py-0 text-sm',
        'focus-visible:ring-0 focus-visible:ring-offset-0',
        className,
      )}
      {...props}
    />
  )
}

function isLogic(node: FilterNode): node is Extract<FilterNode, { children: FilterNode[] }> {
  return node.op === LOGIC_OP.AND || node.op === LOGIC_OP.OR
}

function isNot(node: FilterNode): node is Extract<FilterNode, { child: FilterNode }> {
  return node.op === LOGIC_OP.NOT
}

export function GtdPerspectiveEditor({
  perspective,
  error,
  onSave,
  onClose,
}: {
  perspective?: Perspective
  error?: string | null
  onSave: (input: PerspectiveInput) => void
  onClose: () => void
}) {
  const projects = useAtomValue(DirStore.projectRefsAtom)
  const tags = useAtomValue(TagsStore.tagRefsAtom)
  const [input, setInput] = useState(() => initialInput(perspective))

  const setFilter = (filter: FilterNode | null) =>
    setInput(current => ({ ...current, filter }))

  const templatePerspectives = builtinPerspectives().filter(
    p => p.id !== BUILTIN_PERSPECTIVE_ID.FORECAST,
  )

  function applyBuiltinTemplate(id: string) {
    const tpl = templatePerspectives.find(p => p.id === id)
    if (!tpl)
      return
    const filter = tpl.filter == null ? null : filterToInput(toBinaryFilterTree(tpl.filter))
    setInput({
      name: tpl.name,
      icon: tpl.icon,
      filter,
      groupBy: [...tpl.groupBy],
      sortBy: tpl.sortBy.map(s => ({ ...s })),
    })
  }

  return (
    <div
      className="fixed left-64 right-0 bottom-0 top-16.25 z-40 flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full flex-col border-l border-border bg-card shadow-2xl">
        <header className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">
              {perspective ? '编辑透视' : '新建透视'}
            </h2>
            <p className="text-xs text-muted-foreground">
              过滤表达式：且/或二元链 · 非单分支 · 深度 ≤ 5、节点 ≤ 32
            </p>
          </div>
          <Button type="button" variant="ghost" className="size-9 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4">
            <label className="block space-y-1 text-xs text-muted-foreground">
              名称
              <Input
                value={input.name}
                onChange={e => setInput(current => ({ ...current, name: e.target.value }))}
                placeholder="透视名称"
              />
            </label>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">过滤条件</h3>
              <FilterExpressionEditor projects={projects} tags={tags} node={input.filter} onChange={setFilter} />
            </section>

            <label className="block max-w-xs space-y-1 text-xs text-muted-foreground">
              分组
              <Select
                value={input.groupBy[0] ?? GROUP_KEY.NONE}
                onChange={e => setInput(current => ({
                  ...current,
                  groupBy: e.target.value === GROUP_KEY.NONE ? [] : [e.target.value as PerspectiveInput['groupBy'][number]],
                }))}
              >
                {Object.entries(GROUP_KEY_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>

            <label className="block max-w-xs space-y-1 text-xs text-muted-foreground">
              顺序
              <Select
                value={input.sortBy[0]?.field ?? SORT_FIELD.ORDER}
                onChange={e => setInput(current => ({
                  ...current,
                  sortBy: [{ field: e.target.value as PerspectiveInput['sortBy'][number]['field'], dir: SORT_DIR.ASC }],
                }))}
              >
                {Object.entries(SORT_FIELD_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
          </div>

          <aside className="flex w-40 shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-muted/20 p-3">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">推荐视图</h3>
            <p className="text-[10px] leading-snug text-muted-foreground">
              覆盖名称 / 过滤 / 分组 / 顺序；保存后才落库。
            </p>
            <div className="flex flex-col gap-1.5">
              {templatePerspectives.map(p => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  className="h-8 w-full justify-start px-2.5 text-xs"
                  onClick={() => applyBuiltinTemplate(p.id)}
                >
                  {p.name}
                </Button>
              ))}
            </div>
          </aside>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border p-4">
          {error && <p className="mr-auto self-center text-xs text-rose-400">{error}</p>}
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>取消</Button>
          <Button
            type="button"
            className="h-9"
            disabled={!input.name.trim()}
            onClick={() => onSave(input)}
          >
            保存
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ---------- 表达式编辑器（Linear pill × Notion 软嵌套） ----------

function FilterExpressionEditor({
  projects,
  tags,
  node,
  onChange,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  node: FilterNode | null
  onChange: (node: FilterNode | null) => void
}) {
  if (node == null) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">用自然语言式条件组合过滤，例如「旗标 等于 是」且「截止日 在区间…」。</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => onChange(defaultLeaf())}>
            <Plus className="size-3.5" />
            添加条件
          </Button>
          <Button type="button" variant="outline" className="h-8 text-xs" onClick={() => onChange(defaultBinaryAnd())}>
            <Plus className="size-3.5" />
            添加组合
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => onChange({ op: LOGIC_OP.NOT, child: defaultLeaf() })}
          >
            <Plus className="size-3.5" />
            添加非
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ExprNode
      projects={projects}
      tags={tags}
      node={node}
      onChange={onChange}
      onRemove={() => onChange(null)}
      depth={0}
    />
  )
}

function ExprNode({
  projects,
  tags,
  node,
  onChange,
  onRemove,
  depth,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  node: FilterNode
  onChange: (node: FilterNode) => void
  onRemove: () => void
  depth: number
}) {
  if (isLogic(node)) {
    return (
      <LogicChain
        projects={projects}
        tags={tags}
        node={node}
        onChange={onChange}
        onRemove={onRemove}
        depth={depth}
      />
    )
  }
  if (isNot(node)) {
    return (
      <NotWrap
        projects={projects}
        tags={tags}
        node={node}
        onChange={onChange}
        onRemove={onRemove}
        depth={depth}
      />
    )
  }
  return (
    <LeafRow
      projects={projects}
      tags={tags}
      node={node}
      onChange={onChange}
      onRemove={onRemove}
    />
  )
}

function LogicChain({
  projects,
  tags,
  node,
  onChange,
  onRemove,
  depth,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  node: Extract<FilterNode, { children: FilterNode[] }>
  onChange: (node: FilterNode) => void
  onRemove: () => void
  depth: number
}) {
  const flat = flattenSameLogicChain(node)
  const op = flat?.op ?? node.op
  const items = flat?.items ?? node.children
  const isOr = op === LOGIC_OP.OR

  const replaceItems = (nextItems: FilterNode[]) => {
    if (nextItems.length === 0) {
      onRemove()
      return
    }
    if (nextItems.length === 1) {
      onChange(nextItems[0]!)
      return
    }
    onChange(foldLogic(op, nextItems))
  }

  const updateAt = (i: number, child: FilterNode) =>
    replaceItems(items.map((c, idx) => idx === i ? child : c))

  const removeAt = (i: number) =>
    replaceItems(items.filter((_, idx) => idx !== i))

  return (
    <div
      className={cn(
        'relative space-y-2 rounded-lg border p-2.5 pr-8',
        // 外层轻底；内层缩进 + 更高对比底色，避免删除钮与外层齐平难辨
        depth === 0 && 'border-border/50 bg-muted/15',
        depth === 1 && 'ml-4 border-border/70 bg-background shadow-sm ring-1 ring-border/40',
        depth >= 2 && 'ml-4 border-border/60 bg-muted/45 ring-1 ring-inset ring-border/30',
        isOr ? 'border-l-[3px] border-l-amber-500/60' : 'border-l-[3px] border-l-primary/50',
      )}
    >
      <button
        type="button"
        className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={onRemove}
        title={`删除此「${LOGIC_OP_TEXT[op]}」组合`}
      >
        <Trash2 className="size-3.5" />
      </button>
      <div className="space-y-1.5 border-l border-border/40 pl-3">
        {items.map((child, i) => {
          const rowKey = `${op}:${i}:${child.op}:${'field' in child ? child.field : 'child' in child ? 'not' : 'group'}`
          const childIsGroup = isLogic(child)
          return (
            <div key={rowKey} className="space-y-1.5">
              {i > 0 && (
                <button
                  type="button"
                  className={chainConjPill}
                  onClick={() => onChange(setLogicChainOp(node, op === LOGIC_OP.AND ? LOGIC_OP.OR : LOGIC_OP.AND))}
                  title="切换且/或"
                >
                  {LOGIC_OP_TEXT[op]}
                </button>
              )}
              <div className={cn(childIsGroup && 'pt-0.5')}>
                <ExprNode
                  projects={projects}
                  tags={tags}
                  node={child}
                  onChange={c => updateAt(i, c)}
                  onRemove={() => removeAt(i)}
                  depth={depth + 1}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-border/30 pt-1.5">
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange(appendToLogicChain(node, op, defaultLeaf()))}
        >
          <Plus className="size-3" />
          条件
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange(appendToLogicChain(node, op, defaultBinaryAnd()))}
        >
          <Plus className="size-3" />
          分组
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange(appendToLogicChain(node, op, { op: LOGIC_OP.NOT, child: defaultLeaf() }))}
        >
          <Plus className="size-3" />
          非
        </Button>
      </div>
    </div>
  )
}

function NotWrap({
  projects,
  tags,
  node,
  onChange,
  onRemove,
  depth,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  node: Extract<FilterNode, { child: FilterNode }>
  onChange: (node: FilterNode) => void
  onRemove: () => void
  depth: number
}) {
  // 叶子取非：内嵌到行内红色「非」tag，再点取消；组合取非：左侧仅一枚红边 tag
  if (!isLogic(node.child) && !isNot(node.child)) {
    return (
      <LeafRow
        projects={projects}
        tags={tags}
        node={node.child}
        negated
        onChange={child => onChange({ op: LOGIC_OP.NOT, child })}
        onToggleNot={() => onChange(node.child)}
        onRemove={onRemove}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-2',
        depth >= 1 && 'ml-4 ring-1 ring-destructive/15',
      )}
    >
      <button
        type="button"
        className={cn(
          pillBase,
          'h-7 shrink-0 self-start border-destructive bg-destructive/10 px-2 text-xs font-medium text-destructive',
        )}
        title="取消取非"
        onClick={() => onChange(node.child)}
      >
        {LOGIC_OP_TEXT[LOGIC_OP.NOT]}
      </button>
      <div className="min-w-0 flex-1">
        <ExprNode
          projects={projects}
          tags={tags}
          node={node.child}
          onChange={child => onChange({ op: LOGIC_OP.NOT, child })}
          onRemove={onRemove}
          depth={depth + 1}
        />
      </div>
    </div>
  )
}

function LeafRow({
  projects,
  tags,
  node,
  onChange,
  onRemove,
  negated = false,
  onToggleNot,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  node: Extract<FilterNode, { field: string }>
  onChange: (node: FilterNode) => void
  onRemove: () => void
  /** 已取非：只保留红边「非」tag，再点取消 */
  negated?: boolean
  onToggleNot?: () => void
}) {
  const field = node.field as string
  const op = node.op as string

  const changeField = (newField: string) => {
    const newOp = FILTER_FIELD_OPS[newField as keyof typeof FILTER_FIELD_OPS]![0]!
    onChange({ op: newOp, field: newField, value: defaultValueFor(newField, newOp) } as FilterNode)
  }
  const changeOp = (newOp: string) =>
    onChange({ op: newOp, field, value: defaultValueFor(field, newOp) } as FilterNode)
  const changeValue = (value: unknown) => onChange({ op, field, value } as FilterNode)

  return (
    <div className="group flex flex-wrap items-center gap-1.5 rounded-md px-0.5 py-0.5 hover:bg-muted/30">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(pillBase, 'font-medium')}>
            {FILTER_FIELD_TEXT[field as keyof typeof FILTER_FIELD_TEXT] ?? field}
            <ChevronDown className="size-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          {Object.entries(FILTER_FIELD_TEXT).map(([value, label]) => (
            <DropdownMenuItem key={value} onSelect={() => changeField(value)} className={cn(field === value && 'bg-accent')}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={cn(pillBase, pillMuted)}>
            {LEAF_OP_TEXT[op as keyof typeof LEAF_OP_TEXT] ?? op}
            <ChevronDown className="size-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-32">
          {allowedOpsForField(field).map(o => (
            <DropdownMenuItem key={o} onSelect={() => changeOp(o)} className={cn(op === o && 'bg-accent')}>
              {LEAF_OP_TEXT[o as keyof typeof LEAF_OP_TEXT]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {renderLeafValue({ projects, tags, field, op, value: node.value, onChange: changeValue })}

      {negated
        ? (
            <button
              type="button"
              className={cn(
                pillBase,
                'ml-1 h-7 border-destructive bg-destructive/10 px-2 text-xs font-medium text-destructive',
              )}
              title="取消取非"
              onClick={onToggleNot}
            >
              {LOGIC_OP_TEXT[LOGIC_OP.NOT]}
            </button>
          )
        : (
            <div className="ml-1 flex items-center gap-0.5 border-l border-border/50 pl-1.5">
              <button
                type="button"
                className={cn(conjPill, 'min-w-0 px-1.5')}
                title="用且连接另一条件"
                onClick={() => onChange({ op: LOGIC_OP.AND, children: [node, defaultLeaf()] })}
              >
                {LOGIC_OP_TEXT[LOGIC_OP.AND]}
              </button>
              <button
                type="button"
                className={cn(conjPill, 'min-w-0 px-1.5')}
                title="用或连接另一条件"
                onClick={() => onChange({ op: LOGIC_OP.OR, children: [node, defaultLeaf()] })}
              >
                {LOGIC_OP_TEXT[LOGIC_OP.OR]}
              </button>
              <button
                type="button"
                className={cn(conjPill, 'min-w-0 border-destructive/30 px-1.5 text-destructive/80')}
                title="对此条件取非"
                onClick={() => onChange({ op: LOGIC_OP.NOT, child: node })}
              >
                {LOGIC_OP_TEXT[LOGIC_OP.NOT]}
              </button>
            </div>
          )}

      <button
        type="button"
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        onClick={onRemove}
        title="删除条件"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function renderLeafValue({
  projects,
  tags,
  field,
  op,
  value,
  onChange,
}: {
  projects: Array<{ id: string, name: string }>
  tags: Array<{ id: string, name: string }>
  field: string
  op: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (op === LEAF_OP.EMPTY || op === LEAF_OP.EXIST)
    return null

  if (field === FILTER_FIELD.STATUS) {
    return (
      <PillSelect value={String(value ?? 'active')} onChange={e => onChange(e.target.value)}>
        <option value="active">活跃</option>
        <option value="completed">已完成</option>
        <option value="hold">已搁置</option>
        <option value="deleted">已删除</option>
      </PillSelect>
    )
  }

  if (field === FILTER_FIELD.FLAGGED) {
    return (
      <PillSelect value={String(value)} onChange={e => onChange(e.target.value === 'true')}>
        <option value="true">是</option>
        <option value="false">否</option>
      </PillSelect>
    )
  }

  if (field === FILTER_FIELD.ESTIMATE) {
    if (op === LEAF_OP.WITHIN) {
      const range = Array.isArray(value) ? value : [0, 60]
      return (
        <span className="inline-flex items-center gap-1">
          {[0, 1].map(pos => (
            <PillInput
              key={pos === 0 ? 'from' : 'to'}
              type="number"
              min={0}
              value={Number(range[pos] ?? 0)}
              onChange={(e) => {
                const next = [...range]
                next[pos] = Number(e.target.value)
                onChange(next)
              }}
            />
          ))}
        </span>
      )
    }
    return (
      <PillInput
        type="number"
        min={0}
        value={Number(value ?? 0)}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  if (field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE) {
    if (op === LEAF_OP.WITHIN) {
      const range = Array.isArray(value) ? value : []
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          {[0, 1].map((pos) => {
            const t = range[pos] as { value?: string } | undefined
            return (
              <PillInput
                key={pos === 0 ? 'from' : 'to'}
                className="max-w-44"
                type="datetime-local"
                value={(t?.value ?? '').slice(0, 16)}
                onChange={(e) => {
                  const next = [...range]
                  next[pos] = temporalInput(new Date(e.target.value).toISOString())
                  onChange(next)
                }}
              />
            )
          })}
        </span>
      )
    }
    const t = value as { value?: string } | undefined
    return (
      <PillInput
        className="max-w-44"
        type="datetime-local"
        value={(t?.value ?? '').slice(0, 16)}
        onChange={e => onChange(temporalInput(new Date(e.target.value).toISOString()))}
      />
    )
  }

  const current = Array.isArray(value) ? (value[0] as EntityRef | undefined)?.id ?? '' : ''
  return (
    <PillSelect value={current} onChange={e => onChange([{ id: e.target.value }])}>
      <option value="">选择…</option>
      {entitiesForField(field, projects, tags).map(entity => (
        <option key={entity.id} value={entity.id}>{entity.name}</option>
      ))}
    </PillSelect>
  )
}
