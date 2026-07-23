import { Button } from '@components/ui/button'
import { useGtd } from '@hooks/useGtd'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'

/**
 * 同步冲突锁横幅。
 * rejected 时锁前端编辑；用户点「恢复」→ clear 本地 + pull 服务端最新。
 */
export function GtdSyncLock() {
  const { syncLocked, error, recoverFromReject } = useGtd()
  const [recovering, setRecovering] = useState(false)
  if (!syncLocked)
    return null

  const onRecover = async () => {
    setRecovering(true)
    try {
      await recoverFromReject()
    }
    finally {
      setRecovering(false)
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-800 dark:text-rose-200">
      <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
      <span className="min-w-0 flex-1 truncate">
        同步冲突，编辑已锁定
        {error ? `：${error}` : ''}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 border-rose-500/30 text-rose-800 hover:bg-rose-500/10 dark:text-rose-200"
        disabled={recovering}
        onClick={onRecover}
      >
        {recovering ? '恢复中…' : '恢复（重拉服务端数据）'}
      </Button>
    </div>
  )
}
