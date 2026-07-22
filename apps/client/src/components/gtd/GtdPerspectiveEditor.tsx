import type {
  EntityRef,
  FilterNode,
  Perspective,
  PerspectiveInput,
  RowStore,

  TemporalValue,
} from '@agent/gtd'
import {
  allowedOpsForField,
  AVAILABILITY_FILTER,
  AVAILABILITY_FILTER_TEXT,
  FILTER_FIELD,
  FILTER_FIELD_OPS,
  FILTER_FIELD_TEXT,
  GROUP_KEY,
  GROUP_KEY_TEXT,
  LEAF_OP,
  LEAF_OP_TEXT,
  LOGIC_OP,
  LOGIC_OP_TEXT,
  SORT_DIR,
  SORT_FIELD,
  SORT_FIELD_TEXT,
} from '@agent/gtd'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Select } from '@components/ui/select'
import { cn } from '@lib/utils'
import { ChevronDown, CornerDownRight, Plus, Trash2, X } from 'lucide-react'
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

function defaultLeaf(field: string): FilterNode {
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
  // entity some
  return [{ id: '' }]
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
      availabilityFilter: AVAILABILITY_FILTER.REMAINING,
      showCompleted: false,
      showDropped: false,
      flaggedOnly: null,
    }
  }
  return {
    name: perspective.name,
    icon: perspective.icon,
    filter: filterToInput(perspective.filter),
    groupBy: perspective.groupBy,
    sortBy: perspective.sortBy,
    availabilityFilter: perspective.availabilityFilter,
    showCompleted: perspective.showCompleted,
    showDropped: perspective.showDropped,
    flaggedOnly: perspective.flaggedOnly,
  }
}

function entitiesForField(store: RowStore, field: string): Array<{ id: string, name: string }> {
  if (field === FILTER_FIELD.PROJECT)
    return store.liveProjects().map(r => ({ id: r.id, name: r.data.name }))
  if (field === FILTER_FIELD.FOLDER)
    return store.liveFolders().map(r => ({ id: r.id, name: r.data.name }))
  return store.liveTags().map(r => ({ id: r.id, name: r.data.name }))
}

// ---------- 节点视觉系统：语义色编码 ----------

type LogicColor = 'primary' | 'amber' | 'destructive'
type OpCategory = 'neutral' | 'primary' | 'amber'

function logicColor(op: string): LogicColor {
  if (op === LOGIC_OP.AND)
    return 'primary'
  if (op === LOGIC_OP.OR)
    return 'amber'
  return 'destructive'
}

function opCategory(op: string): OpCategory {
  if (op === LEAF_OP.IS || op === LEAF_OP.IS_NOT)
    return 'neutral'
  if (op === LEAF_OP.SOME || op === LEAF_OP.EMPTY)
    return 'primary'
  return 'amber' // before / after / within / exist
}

/** 逻辑节点：导轨 + 激活段颜色（静态字面量，避免 Tailwind purge 漏类） */
const LOGIC_STYLE: Record<LogicColor, { rail: string, active: string, badge: 'primary' | 'amber' | 'destructive' }> = {
  primary: { rail: 'border-primary/40', active: 'bg-primary/15 text-primary', badge: 'primary' },
  amber: { rail: 'border-amber-500/40', active: 'bg-amber-500/15 text-amber-400', badge: 'amber' },
  destructive: { rail: 'border-destructive/40', active: 'bg-destructive/15 text-destructive', badge: 'destructive' },
}

/** 操作符 chip：底色 + 文字 + 边框 */
const OP_CHIP: Record<OpCategory, string> = {
  neutral: 'bg-muted/40 text-muted-foreground border-border',
  primary: 'bg-primary/10 text-primary border-primary/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
}

/** 操作符 chip 前置圆点 */
const OP_DOT: Record<OpCategory, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  amber: 'bg-amber-500',
}

export function GtdPerspectiveEditor({
  store,
  perspective,
  error,
  onSave,
  onClose,
}: {
  store: RowStore
  perspective?: Perspective
  error?: string | null
  onSave: (input: PerspectiveInput) => void
  onClose: () => void
}) {
  const [input, setInput] = useState(() => initialInput(perspective))

  const setFilter = (filter: FilterNode | null) =>
    setInput(current => ({ ...current, filter }))

  return (
    <div
      className="fixed left-64 right-0 bottom-0 top-[65px] z-40 flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-full w-full flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="font-semibold text-slate-100">
              {perspective ? '编辑自定义透视' : '新建自定义透视'}
            </h2>
            <p className="text-xs text-slate-500">可嵌套过滤树（与/或/非），深度 ≤ 5、节点 ≤ 32</p>
          </div>
          <Button type="button" variant="ghost" className="size-9 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <Input
            value={input.name}
            onChange={e => setInput(current => ({ ...current, name: e.target.value }))}
            placeholder="透视名称"
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-slate-500">
              可用性
              <Select
                value={input.availabilityFilter}
                onChange={e => setInput(current => ({ ...current, availabilityFilter: e.target.value as PerspectiveInput['availabilityFilter'] }))}
              >
                {Object.entries(AVAILABILITY_FILTER_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-500">
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
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={input.showCompleted}
                onCheckedChange={checked =>
                  setInput(c => ({ ...c, showCompleted: checked === true }))}
              />
              显示已完成
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={input.showDropped}
                onCheckedChange={checked =>
                  setInput(c => ({ ...c, showDropped: checked === true }))}
              />
              显示已放弃
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={input.flaggedOnly === true}
                onCheckedChange={checked =>
                  setInput(c => ({ ...c, flaggedOnly: checked === true ? true : null }))}
              />
              仅旗标
            </label>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">过滤规则</h3>
            </div>
            <FilterTreeEditor store={store} node={input.filter} onChange={setFilter} />
          </section>

          <label className="space-y-1 text-xs text-slate-500">
            排序
            <Select
              value={input.sortBy[0]?.field ?? SORT_FIELD.ORDER}
              onChange={e => setInput(current => ({ ...current, sortBy: [{ field: e.target.value as PerspectiveInput['sortBy'][number]['field'], dir: SORT_DIR.ASC }] }))}
            >
              {Object.entries(SORT_FIELD_TEXT).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {error && <p className="mr-auto self-center text-xs text-rose-400">{error}</p>}
          <Button type="button" variant="outline" className="h-9" onClick={onClose}>取消</Button>
          <Button type="button" className="h-9" disabled={!input.name.trim()} onClick={() => onSave(input)}>
            保存
          </Button>
        </footer>
      </div>
    </div>
  )
}

// ---------- 树编辑器 ----------

function FilterTreeEditor({
  store,
  node,
  onChange,
}: {
  store: RowStore
  node: FilterNode | null
  onChange: (node: FilterNode | null) => void
}) {
  if (node == null) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-slate-700 p-4">
        <p className="text-xs text-slate-500">从一条规则或一个规则组开始构建可嵌套过滤树。</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={() => onChange(defaultLeaf(FILTER_FIELD.STATUS))}>
            <Plus className="size-4" />
            添加规则
          </Button>
          <Button type="button" variant="outline" className="h-9" onClick={() => onChange({ op: LOGIC_OP.AND, children: [defaultLeaf(FILTER_FIELD.STATUS)] })}>
            <Plus className="size-4" />
            添加规则组
          </Button>
          <Button type="button" variant="outline" className="h-9" onClick={() => onChange({ op: LOGIC_OP.NOT, child: defaultLeaf(FILTER_FIELD.STATUS) })}>
            <Plus className="size-4" />
            添加非组
          </Button>
        </div>
      </div>
    )
  }
  return (
    <NodeEditor
      store={store}
      node={node}
      onChange={onChange}
      onRemove={() => onChange(null)}
      depth={0}
      path=""
    />
  )
}

function NodeEditor({
  store,
  node,
  onChange,
  onRemove,
  depth,
  path,
}: {
  store: RowStore
  node: FilterNode
  onChange: (node: FilterNode) => void
  onRemove: () => void
  depth: number
  path: string
}) {
  if (node.op === LOGIC_OP.AND || node.op === LOGIC_OP.OR) {
    const color = logicColor(node.op)
    const style = LOGIC_STYLE[color]
    const updateChild = (i: number, child: FilterNode) =>
      onChange({ ...node, children: node.children.map((c, idx) => idx === i ? child : c) })
    const removeChild = (i: number) =>
      onChange({ ...node, children: node.children.filter((_, idx) => idx !== i) })
    const addChild = (child: FilterNode) =>
      onChange({ ...node, children: [...node.children, child] })
    return (
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                node.op === LOGIC_OP.AND
                  ? LOGIC_STYLE.primary.active
                  : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => onChange({ op: LOGIC_OP.AND, children: node.children })}
            >
              {LOGIC_OP_TEXT[LOGIC_OP.AND]}
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                node.op === LOGIC_OP.OR
                  ? LOGIC_STYLE.amber.active
                  : 'text-muted-foreground hover:bg-accent',
              )}
              onClick={() => onChange({ op: LOGIC_OP.OR, children: node.children })}
            >
              {LOGIC_OP_TEXT[LOGIC_OP.OR]}
            </button>
          </div>
          <Badge variant={style.badge}>规则组</Badge>
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => addChild(defaultLeaf(FILTER_FIELD.STATUS))}>
              <Plus className="size-3.5" />
              规则
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => addChild({ op: LOGIC_OP.AND, children: [defaultLeaf(FILTER_FIELD.STATUS)] })}>
              <Plus className="size-3.5" />
              子组
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-2 text-xs" onClick={() => addChild({ op: LOGIC_OP.NOT, child: defaultLeaf(FILTER_FIELD.STATUS) })}>
              <Plus className="size-3.5" />
              非组
            </Button>
            <Button type="button" variant="ghost" className="size-8 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
        <div className={cn('space-y-2 border-l-2 pl-3', style.rail)}>
          {node.children.map((child, i) => {
            const childPath = `${path}.${i}`
            return (
              <NodeEditor
                key={childPath}
                store={store}
                node={child}
                onChange={c => updateChild(i, c)}
                onRemove={() => removeChild(i)}
                depth={depth + 1}
                path={childPath}
              />
            )
          })}
        </div>
      </div>
    )
  }

  if (node.op === LOGIC_OP.NOT) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
        <div className="flex items-center gap-2">
          <Badge variant="destructive">
            <CornerDownRight className="size-3" />
            {LOGIC_OP_TEXT[LOGIC_OP.NOT]}
          </Badge>
          <span className="text-xs text-slate-500">对其下规则取反</span>
          <Button type="button" variant="ghost" className="ml-auto size-8 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className={cn('border-l-2 pl-3', LOGIC_STYLE.destructive.rail)}>
          <NodeEditor
            store={store}
            node={node.child}
            onChange={child => onChange({ op: LOGIC_OP.NOT, child })}
            onRemove={onRemove}
            depth={depth + 1}
            path={`${path}.n`}
          />
        </div>
      </div>
    )
  }

  // 叶子
  return (
    <LeafEditor
      store={store}
      node={node as Extract<FilterNode, { field: string }>}
      onChange={onChange}
      onRemove={onRemove}
    />
  )
}

function LeafEditor({
  store,
  node,
  onChange,
  onRemove,
}: {
  store: RowStore
  node: Extract<FilterNode, { field: string }>
  onChange: (node: FilterNode) => void
  onRemove: () => void
}) {
  const field = node.field as string
  const op = node.op as string
  const cat = opCategory(op)

  const changeField = (newField: string) => {
    const newOp = FILTER_FIELD_OPS[newField as keyof typeof FILTER_FIELD_OPS]![0]!
    onChange({ op: newOp, field: newField, value: defaultValueFor(newField, newOp) } as FilterNode)
  }
  const changeOp = (newOp: string) =>
    onChange({ op: newOp, field, value: defaultValueFor(field, newOp) } as FilterNode)
  const changeValue = (value: unknown) => onChange({ op, field, value } as FilterNode)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="grid grid-cols-[1fr_1fr_2rem] items-center gap-2">
        <Select value={field} onChange={e => changeField(e.target.value)}>
          {Object.entries(FILTER_FIELD_TEXT).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-9 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors',
                OP_CHIP[cat],
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', OP_DOT[cat])} />
                {LEAF_OP_TEXT[op as keyof typeof LEAF_OP_TEXT]}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {allowedOpsForField(field).map(o => (
              <DropdownMenuItem
                key={o}
                onSelect={() => changeOp(o)}
                className={cn(op === o && 'bg-accent')}
              >
                {LEAF_OP_TEXT[o as keyof typeof LEAF_OP_TEXT]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="ghost"
          className="size-9 p-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <LeafValue store={store} field={field} op={op} value={node.value} onChange={changeValue} />
    </div>
  )
}

function LeafValue({
  store,
  field,
  op,
  value,
  onChange,
}: {
  store: RowStore
  field: string
  op: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  if (op === LEAF_OP.EMPTY || op === LEAF_OP.EXIST)
    return null

  if (field === FILTER_FIELD.STATUS) {
    return (
      <Select value={String(value ?? 'active')} onChange={e => onChange(e.target.value)}>
        <option value="active">活跃</option>
        <option value="completed">已完成</option>
        <option value="cancelled">已放弃</option>
        <option value="deleted">已删除</option>
      </Select>
    )
  }

  if (field === FILTER_FIELD.FLAGGED) {
    return (
      <Select value={String(value)} onChange={e => onChange(e.target.value === 'true')}>
        <option value="true">是</option>
        <option value="false">否</option>
      </Select>
    )
  }

  if (field === FILTER_FIELD.ESTIMATE) {
    if (op === LEAF_OP.WITHIN) {
      const range = Array.isArray(value) ? value : [0, 60]
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map(pos => (
            <Input
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
        </div>
      )
    }
    return (
      <Input type="number" min={0} value={Number(value ?? 0)} onChange={e => onChange(Number(e.target.value))} />
    )
  }

  if (field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE) {
    if (op === LEAF_OP.WITHIN) {
      const range = Array.isArray(value) ? value : []
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((pos) => {
            const t = range[pos] as { value?: string } | undefined
            return (
              <Input
                key={pos === 0 ? 'from' : 'to'}
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
        </div>
      )
    }
    const t = value as { value?: string } | undefined
    return (
      <Input
        type="datetime-local"
        value={(t?.value ?? '').slice(0, 16)}
        onChange={e => onChange(temporalInput(new Date(e.target.value).toISOString()))}
      />
    )
  }

  // 实体字段 some：单选（包装为 [{id}]）
  const current = Array.isArray(value) ? (value[0] as EntityRef | undefined)?.id ?? '' : ''
  return (
    <Select value={current} onChange={e => onChange([{ id: e.target.value }])}>
      <option value="">选择…</option>
      {entitiesForField(store, field).map(entity => (
        <option key={entity.id} value={entity.id}>{entity.name}</option>
      ))}
    </Select>
  )
}
