import type { RepeatRule } from '@agent/gtd'
import type { RepeatRuleInput } from '@stores/gtd-store'
import {
  REPEAT_ANCHOR,
  REPEAT_ANCHOR_TEXT,
  REPEAT_CYCLE,
  REPEAT_CYCLE_TEXT,
} from '@agent/gtd'
import { GtdDateTimeField } from '@components/gtd/GtdDateTimeField'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select } from '@components/ui/select'
import { useState } from 'react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function defaultRule(): RepeatRuleInput {
  return {
    cycle: REPEAT_CYCLE.WEEKLY,
    interval: 1,
    anchor: REPEAT_ANCHOR.COMPLETION,
    daysOfWeek: [],
    endDate: null,
    maxOccurrences: null,
  }
}

export function GtdRepeatEditor({
  rule,
  hasDueDate,
  hasDeferDate,
  onSave,
}: {
  rule: RepeatRule | null
  hasDueDate: boolean
  hasDeferDate: boolean
  onSave: (input: RepeatRuleInput | null) => void
}) {
  const [enabled, setEnabled] = useState(rule != null)
  const [draft, setDraft] = useState<RepeatRuleInput>(() => rule
    ? {
        cycle: rule.cycle,
        interval: rule.interval,
        anchor: rule.anchor,
        daysOfWeek: rule.daysOfWeek,
        endDate: rule.endDate,
        maxOccurrences: rule.maxOccurrences,
      }
    : defaultRule())

  return (
    <section className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-slate-300">重复</div>
          <div className="text-[11px] text-slate-500">完成后保留当前实例，并生成下一实例</div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9"
          onClick={() => {
            if (enabled) {
              setEnabled(false)
              onSave(null)
            }
            else {
              setEnabled(true)
            }
          }}
        >
          {enabled ? '移除重复' : '启用重复'}
        </Button>
      </div>

      {enabled && (
        <div className="space-y-3 border-t border-slate-800 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">周期</span>
              <Select
                value={draft.cycle}
                onChange={e => setDraft(current => ({
                  ...current,
                  cycle: e.target.value as RepeatRuleInput['cycle'],
                  daysOfWeek: e.target.value === REPEAT_CYCLE.WEEKLY
                    ? current.daysOfWeek
                    : [],
                }))}
              >
                {Object.entries(REPEAT_CYCLE_TEXT).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">每 N 个周期</span>
              <Input
                type="number"
                min={1}
                value={draft.interval}
                onChange={e => setDraft(current => ({
                  ...current,
                  interval: Math.max(1, Number(e.target.value) || 1),
                }))}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-slate-500">下一实例基准</span>
            <Select
              value={draft.anchor}
              onChange={e => setDraft(current => ({
                ...current,
                anchor: e.target.value as RepeatRuleInput['anchor'],
              }))}
            >
              {Object.entries(REPEAT_ANCHOR_TEXT).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  disabled={
                    (value === REPEAT_ANCHOR.DUE && !hasDueDate)
                    || (value === REPEAT_ANCHOR.DEFER && !hasDeferDate)
                  }
                >
                  {label}
                </option>
              ))}
            </Select>
          </label>

          {draft.cycle === REPEAT_CYCLE.WEEKLY && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">星期（不选表示不限）</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((label, day) => {
                  const selected = draft.daysOfWeek.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setDraft(current => ({
                        ...current,
                        daysOfWeek: selected
                          ? current.daysOfWeek.filter(value => value !== day)
                          : [...current.daysOfWeek, day].sort(),
                      }))}
                      className={`size-8 rounded-md border text-xs ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-slate-700 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <GtdDateTimeField
            label="结束日期（可选）"
            value={draft.endDate}
            onChange={endDate => setDraft(current => ({ ...current, endDate }))}
          />

          <label className="block space-y-1">
            <span className="text-xs text-slate-500">最多完成次数（可选）</span>
            <Input
              type="number"
              min={1}
              value={draft.maxOccurrences ?? ''}
              placeholder="不限制"
              onChange={e => setDraft(current => ({
                ...current,
                maxOccurrences: e.target.value
                  ? Math.max(1, Number(e.target.value))
                  : null,
              }))}
            />
          </label>

          {rule && (
            <p className="text-[11px] text-slate-500">
              已完成
              {' '}
              {rule.completedOccurrences}
              {' '}
              次
            </p>
          )}

          <Button
            type="button"
            className="h-9 w-full"
            onClick={() => onSave(draft)}
          >
            应用重复规则
          </Button>
        </div>
      )}
    </section>
  )
}
