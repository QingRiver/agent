import type {
  FilterRuleInput,
  GtdDocument,
  Perspective,
  PerspectiveInput,
} from '@agent/gtd'
import {
  allowedOpsForField,
  AVAILABILITY_FILTER,
  AVAILABILITY_FILTER_TEXT,
  FILTER_FIELD,
  FILTER_FIELD_OPS,
  FILTER_FIELD_TEXT,
  FILTER_OP,
  FILTER_OP_TEXT,
  GROUP_KEY,
  GROUP_KEY_TEXT,
  PERSPECTIVE_MATCH,
  SORT_DIR,
  SORT_FIELD,
  SORT_FIELD_TEXT,
} from '@agent/gtd'
import { Button } from '@components/ui/button'
import { Checkbox } from '@components/ui/checkbox'
import { Input } from '@components/ui/input'
import { Select } from '@components/ui/select'
import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

function initialInput(perspective?: Perspective): PerspectiveInput {
  if (!perspective) {
    return {
      name: '',
      icon: null,
      matchMode: PERSPECTIVE_MATCH.ALL,
      filterRules: [],
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
    matchMode: perspective.matchMode,
    filterRules: perspective.filterRules.map(rule => ({
      field: rule.field,
      op: rule.op,
      value: normalizePersistedValue(rule.field, rule.op, rule.value),
    })),
    groupBy: perspective.groupBy,
    sortBy: perspective.sortBy,
    availabilityFilter: perspective.availabilityFilter,
    showCompleted: perspective.showCompleted,
    showDropped: perspective.showDropped,
    flaggedOnly: perspective.flaggedOnly,
  }
}

function normalizePersistedValue(field: string, op: string, value: unknown): unknown {
  if (op === FILTER_OP.IS_NULL || op === FILTER_OP.IS_NOT_NULL)
    return undefined
  if (
    field === FILTER_FIELD.PROJECT
    || field === FILTER_FIELD.FOLDER
    || field === FILTER_FIELD.TAG
  ) {
    if (Array.isArray(value))
      return value.map(id => ({ id: String(id) }))
    return { id: String(value) }
  }
  if (field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE) {
    if (Array.isArray(value)) {
      return value.map(item => ({ type: 'absolute', value: String(item) }))
    }
    return { type: 'absolute', value: String(value) }
  }
  return value
}

function defaultValue(field: string, op: string): unknown {
  if (op === FILTER_OP.IS_NULL || op === FILTER_OP.IS_NOT_NULL)
    return undefined
  if (
    field === FILTER_FIELD.PROJECT
    || field === FILTER_FIELD.FOLDER
    || field === FILTER_FIELD.TAG
  ) {
    return op === FILTER_OP.IN ? [] : { id: '' }
  }
  if (field === FILTER_FIELD.DEFER_DATE || field === FILTER_FIELD.DUE_DATE) {
    const temporal = { type: 'absolute', value: new Date().toISOString() }
    return op === FILTER_OP.BETWEEN ? [temporal, temporal] : temporal
  }
  if (field === FILTER_FIELD.FLAGGED)
    return true
  if (field === FILTER_FIELD.ESTIMATE)
    return op === FILTER_OP.BETWEEN ? [0, 60] : 30
  return op === FILTER_OP.IN ? [] : 'active'
}

function entitiesForField(doc: GtdDocument, field: string) {
  if (field === FILTER_FIELD.PROJECT)
    return doc.projects
  if (field === FILTER_FIELD.FOLDER)
    return doc.folders
  return doc.tags
}

export function GtdPerspectiveEditor({
  doc,
  perspective,
  error,
  onSave,
  onClose,
}: {
  doc: GtdDocument
  perspective?: Perspective
  error?: string | null
  onSave: (input: PerspectiveInput) => void
  onClose: () => void
}) {
  const [input, setInput] = useState(() => initialInput(perspective))

  const updateRule = (index: number, rule: FilterRuleInput) => {
    setInput(current => ({
      ...current,
      filterRules: current.filterRules.map((item, i) => i === index ? rule : item),
    }))
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-700 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="font-semibold text-slate-100">
              {perspective ? '编辑自定义透视' : '新建自定义透视'}
            </h2>
            <p className="text-xs text-slate-500">过滤、分组和排序使用与未来 MCP 相同的契约</p>
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
                onChange={e => setInput(current => ({
                  ...current,
                  availabilityFilter: e.target.value as PerspectiveInput['availabilityFilter'],
                }))}
              >
                {Object.entries(AVAILABILITY_FILTER_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              规则关系
              <Select
                value={input.matchMode}
                onChange={e => setInput(current => ({
                  ...current,
                  matchMode: e.target.value as PerspectiveInput['matchMode'],
                }))}
              >
                <option value={PERSPECTIVE_MATCH.ALL}>全部满足</option>
                <option value={PERSPECTIVE_MATCH.ANY}>任一满足</option>
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
              <Button
                type="button"
                variant="outline"
                className="h-9"
                onClick={() => setInput(current => ({
                  ...current,
                  filterRules: [...current.filterRules, {
                    field: FILTER_FIELD.STATUS,
                    op: FILTER_OP.EQ,
                    value: 'active',
                  }],
                }))}
              >
                <Plus className="size-4" />
                添加规则
              </Button>
            </div>
            {input.filterRules.map((rule, index) => (
              <div
                key={`${rule.field}:${rule.op}:${JSON.stringify(rule.value)}`}
                className="space-y-2 rounded-lg border border-slate-800 p-3"
              >
                <div className="grid grid-cols-[1fr_1fr_2rem] gap-2">
                  <Select
                    value={rule.field}
                    onChange={(e) => {
                      const field = e.target.value as FilterRuleInput['field']
                      const op = FILTER_FIELD_OPS[field][0]
                      updateRule(index, { field, op, value: defaultValue(field, op) })
                    }}
                  >
                    {Object.entries(FILTER_FIELD_TEXT).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                  <Select
                    value={rule.op}
                    onChange={(e) => {
                      const op = e.target.value as FilterRuleInput['op']
                      updateRule(index, { ...rule, op, value: defaultValue(rule.field, op) })
                    }}
                  >
                    {allowedOpsForField(rule.field).map(op => (
                      <option key={op} value={op}>
                        {FILTER_OP_TEXT[op as keyof typeof FILTER_OP_TEXT]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-9 p-0"
                    onClick={() => setInput(current => ({
                      ...current,
                      filterRules: current.filterRules.filter((_, i) => i !== index),
                    }))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <RuleValue
                  doc={doc}
                  rule={rule}
                  onChange={value => updateRule(index, { ...rule, value })}
                />
              </div>
            ))}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-slate-500">
              分组
              <Select
                value={input.groupBy[0] ?? GROUP_KEY.NONE}
                onChange={e => setInput(current => ({
                  ...current,
                  groupBy: e.target.value === GROUP_KEY.NONE
                    ? []
                    : [e.target.value as PerspectiveInput['groupBy'][number]],
                }))}
              >
                {Object.entries(GROUP_KEY_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1 text-xs text-slate-500">
              排序
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
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 p-4">
          {error && (
            <p className="mr-auto self-center text-xs text-rose-400">{error}</p>
          )}
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

function RuleValue({
  doc,
  rule,
  onChange,
}: {
  doc: GtdDocument
  rule: FilterRuleInput
  onChange: (value: unknown) => void
}) {
  if (rule.op === FILTER_OP.IS_NULL || rule.op === FILTER_OP.IS_NOT_NULL)
    return null

  if (
    rule.field === FILTER_FIELD.PROJECT
    || rule.field === FILTER_FIELD.FOLDER
    || rule.field === FILTER_FIELD.TAG
  ) {
    const current = Array.isArray(rule.value)
      ? (rule.value[0] as { id?: string } | undefined)?.id ?? ''
      : (rule.value as { id?: string } | undefined)?.id ?? ''
    return (
      <Select
        value={current}
        onChange={(e) => {
          const ref = { id: e.target.value }
          onChange(rule.op === FILTER_OP.IN ? [ref] : ref)
        }}
      >
        <option value="">选择…</option>
        {entitiesForField(doc, rule.field).map(entity => (
          <option key={entity.id} value={entity.id}>{entity.name}</option>
        ))}
      </Select>
    )
  }

  if (rule.field === FILTER_FIELD.FLAGGED) {
    return (
      <Select
        value={String(rule.value)}
        onChange={e => onChange(e.target.value === 'true')}
      >
        <option value="true">是</option>
        <option value="false">否</option>
      </Select>
    )
  }

  if (rule.field === FILTER_FIELD.ESTIMATE) {
    if (rule.op === FILTER_OP.BETWEEN) {
      const range = Array.isArray(rule.value) ? rule.value : [0, 60]
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map(position => (
            <Input
              key={position === 0 ? 'from' : 'to'}
              type="number"
              min={0}
              value={Number(range[position] ?? 0)}
              onChange={(e) => {
                const next = [...range]
                next[position] = Number(e.target.value)
                onChange(next)
              }}
            />
          ))}
        </div>
      )
    }
    const value = rule.value
    return (
      <Input
        type="number"
        min={0}
        value={Number(value ?? 0)}
        onChange={e => onChange(Number(e.target.value))}
      />
    )
  }

  if (rule.field === FILTER_FIELD.DEFER_DATE || rule.field === FILTER_FIELD.DUE_DATE) {
    if (rule.op === FILTER_OP.BETWEEN) {
      const range = Array.isArray(rule.value) ? rule.value : []
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((position) => {
            const temporal = range[position] as { value?: string } | undefined
            return (
              <Input
                key={position === 0 ? 'from' : 'to'}
                type="datetime-local"
                value={(temporal?.value ?? '').slice(0, 16)}
                onChange={(e) => {
                  const next = [...range]
                  next[position] = {
                    type: 'absolute',
                    value: new Date(e.target.value).toISOString(),
                  }
                  onChange(next)
                }}
              />
            )
          })}
        </div>
      )
    }
    const temporal = rule.value
    const iso = (temporal as { value?: string } | undefined)?.value ?? ''
    return (
      <Input
        type="datetime-local"
        value={iso.slice(0, 16)}
        onChange={e => onChange({ type: 'absolute', value: new Date(e.target.value).toISOString() })}
      />
    )
  }

  return (
    <Select
      value={String(Array.isArray(rule.value) ? rule.value[0] ?? '' : rule.value ?? '')}
      onChange={e => onChange(rule.op === FILTER_OP.IN ? [e.target.value] : e.target.value)}
    >
      <option value="active">活跃</option>
      <option value="completed">已完成</option>
      <option value="cancelled">已放弃</option>
      <option value="deleted">已删除</option>
    </Select>
  )
}
