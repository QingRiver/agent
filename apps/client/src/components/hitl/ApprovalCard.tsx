export interface ApprovalInterruptValue {
  type: 'approval'
  message: string
  details: string
}

interface ApprovalCardProps {
  title: string
  content: string
  onApprove: () => void
  onReject: () => void
  /** 嵌入 CopilotChat 气泡时去掉外层卡片边距/边框 */
  variant?: 'card' | 'bubble'
}

export function ApprovalCard({
  title,
  content,
  onApprove,
  onReject,
  variant = 'card',
}: ApprovalCardProps) {
  const shellClass = variant === 'bubble'
    ? 'space-y-2'
    : 'my-3 rounded-lg border border-amber-600/50 bg-amber-950/40 p-4 shadow-sm'

  return (
    <div className={shellClass}>
      <h3 className="flex items-center gap-2 font-semibold text-amber-200">
        <span aria-hidden>⚠️</span>
        {title}
      </h3>
      <p className="mt-2 rounded border border-slate-700 bg-slate-950/80 p-2 text-sm text-slate-200">
        {content}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          批准
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
        >
          拒绝
        </button>
      </div>
    </div>
  )
}
