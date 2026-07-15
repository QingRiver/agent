import type { InterruptRequest, SelectOption } from '@agent/protocol'
import { useState } from 'react'
import { ApprovalCard } from './ApprovalCard'

/**
 * 中断 UI 卡片 —— 按 InterruptRequest.type 分发渲染。
 * 各 Card 收 `onRespond(payload)`,payload 形状由 type 决定
 * (input→{value}, select→{value}, multiSelect→{values}, modal→{action}, approval→{approved}, unlock→{})。
 */

export function InterruptCard({
  request,
  onRespond,
}: {
  request: InterruptRequest
  onRespond: (payload: unknown) => void
}) {
  switch (request.type) {
    case 'input':
      return (
        <InputCard
          message={request.message}
          placeholder={request.placeholder}
          onSubmit={value => onRespond({ value })}
        />
      )
    case 'select':
      return (
        <SelectCard
          message={request.message}
          options={request.options}
          multiple={false}
          onConfirm={v => onRespond({ value: v as string })}
        />
      )
    case 'multiSelect':
      return (
        <SelectCard
          message={request.message}
          options={request.options}
          multiple
          onConfirm={v => onRespond({ values: v as string[] })}
        />
      )
    case 'modal':
      return (
        <ModalCard
          title={request.title}
          body={request.body}
          actions={request.actions}
          onSelect={action => onRespond({ action })}
        />
      )
    case 'approval':
      return (
        <ApprovalCard
          title={request.message}
          content={request.details}
          onApprove={() => onRespond({ approved: true })}
          onReject={() => onRespond({ approved: false, reason: '用户拒绝' })}
        />
      )
    case 'unlock':
      return <UnlockCard message={request.message} onConfirm={() => onRespond({})} />
  }
}

function InputCard({
  message,
  placeholder,
  onSubmit,
}: {
  message: string
  placeholder?: string
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-cyan-200">
        {message}
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim())
            onSubmit(value.trim())
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          {...(placeholder != null ? { placeholder } : {})}
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
        />
        <button type="submit" className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500">
          提交
        </button>
      </form>
    </div>
  )
}

function SelectCard({
  message,
  options,
  multiple,
  onConfirm,
}: {
  message: string
  options: SelectOption[]
  multiple: boolean
  onConfirm: (value: string | string[]) => void
}) {
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-cyan-200">
        {message}
      </h3>
      <div className="space-y-1">
        {options.map((opt, i) => {
          const isCursor = i === cursor
          const isSelected = selected.has(i)
          const prefix = multiple ? (isSelected ? '■' : '□') : isCursor ? '●' : '○'
          return (
            <button
              type="button"
              key={opt.value}
              className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${isCursor ? 'bg-slate-800 text-cyan-200' : 'text-slate-200'}`}
              onClick={() => {
                if (multiple) {
                  setSelected((prev) => {
                    const next = new Set(prev)
                    if (next.has(i))
                      next.delete(i)
                    else
                      next.add(i)
                    return next
                  })
                }
                else {
                  onConfirm(opt.value)
                }
              }}
              onMouseEnter={() => setCursor(i)}
            >
              <span aria-hidden>{prefix}</span>
              <span>{opt.label}</span>
              {opt.description != null && (
                <span className="text-xs text-slate-500">
                  —
                  {opt.description}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {multiple && (
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => onConfirm(Array.from(selected).sort().map(i => options[i]!.value))}
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
        >
          确认选择
        </button>
      )}
    </div>
  )
}

function ModalCard({
  title,
  body,
  actions,
  onSelect,
}: {
  title: string
  body: string
  actions: string[]
  onSelect: (action: string) => void
}) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-700/50 bg-slate-950/60 p-3">
      <h3 className="flex items-center gap-2 font-semibold text-amber-200">
        <span aria-hidden>⚠️</span>
        {title}
      </h3>
      <p className="rounded border border-slate-700 bg-slate-950/80 p-2 text-sm text-slate-200">
        {body}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map(action => (
          <button
            type="button"
            key={action}
            onClick={() => onSelect(action)}
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  )
}

function UnlockCard({
  message,
  onConfirm,
}: {
  message: string
  onConfirm: () => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-300">
        {message}
      </p>
      <button type="button" onClick={onConfirm} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
        确认
      </button>
    </div>
  )
}
