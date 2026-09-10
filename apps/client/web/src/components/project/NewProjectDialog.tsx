import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { runWithCleanup } from '@lib/runWithCleanup'
import { DirStore } from '@stores/dir-store'
import { useState } from 'react'

interface NewProjectDialogProps {
  open: boolean
  onClose: () => void
}

function NewProjectDialogBody({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    const trimmed = name.trim()
    if (!trimmed)
      return
    setError(null)
    setPending(true)
    await runWithCleanup(async () => {
      try {
        await DirStore.createProject(trimmed)
        onClose()
      }
      catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    }, () => setPending(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 id="new-project-title" className="text-lg font-semibold text-foreground">
          新建项目
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">输入项目名称后创建根目录</p>

        <Input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !pending && name.trim())
              void submit()
            if (e.key === 'Escape')
              onClose()
          }}
          placeholder="项目名称"
          className="mt-4"
          disabled={pending}
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() => void submit()}
          >
            创建
          </Button>
        </div>
      </div>
    </div>
  )
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  if (!open)
    return null

  return <NewProjectDialogBody key="new-project" onClose={onClose} />
}
