interface ApprovalCardProps {
  title: string
  content: string
  onApprove: () => void
  onReject: () => void
}

export function ApprovalCard({
  title,
  content,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  return (
    <div className="space-y-2">
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
