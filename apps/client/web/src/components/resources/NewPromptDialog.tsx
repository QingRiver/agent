import type { VersionTextRow } from '@apis/skill-api'
import { VERSION_TEXT_TYPE } from '@agent/proto'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Select } from '@components/ui/select'
import { runWithCleanup } from '@lib/runWithCleanup'
import { DirStore } from '@stores/dir-store'
import { KbStore } from '@stores/kb-store'
import { SkillStore } from '@stores/skill-store'
import { useAtomValue } from 'jotai'
import { useMemo, useState } from 'react'
import { projectRoots } from '../project/projectTree'

interface NewPromptDialogProps {
  open: boolean
  onClose: () => void
  onCreated: (text: VersionTextRow) => void
}

function NewPromptDialogBody({ onClose, onCreated }: Omit<NewPromptDialogProps, 'open'>) {
  const dirs = useAtomValue(DirStore.dirsAtom)
  const kbsByDirId = useAtomValue(KbStore.kbsByDirIdAtom)
  const texts = useAtomValue(SkillStore.textsAtom)
  const projects = useMemo(
    () => projectRoots(dirs).filter(p => !kbsByDirId.has(p.id)),
    [dirs, kbsByDirId],
  )
  const [filename, setFilename] = useState('prompt.md')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!projectId)
      return
    const raw = filename.trim()
    if (!raw) {
      setError('文件名不能为空')
      return
    }
    if (raw.includes('/') || raw.includes('\\') || raw.includes('..')) {
      setError('文件名不能包含路径分隔或 ..')
      return
    }
    const name = raw.includes('.') ? raw : `${raw}.md`
    const clash = texts.find(t => t.mountDirId === projectId && t.filename === name)
    if (clash) {
      setError(`该项目已存在同名文件: ${name}`)
      return
    }
    setError(null)
    setPending(true)
    await runWithCleanup(async () => {
      try {
        const text = await SkillStore.upsertText({
          dirId: projectId,
          filename: name,
          content: '',
          type: VERSION_TEXT_TYPE.PROMPT,
        })
        onCreated(text)
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
        aria-labelledby="new-prompt-title"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"
      >
        <h2 id="new-prompt-title" className="text-lg font-semibold text-foreground">
          新建提示词
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">挂到已有项目，创建后仍在提示词库中编辑</p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-prompt-project">挂载项目</Label>
            {projects.length === 0
              ? (
                  <p className="text-sm text-muted-foreground">请先在「项目」中新建一个非知识库项目</p>
                )
              : (
                  <Select
                    id="new-prompt-project"
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                    disabled={pending}
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-prompt-filename">文件名</Label>
            <Input
              id="new-prompt-filename"
              autoFocus
              value={filename}
              onChange={e => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !pending && filename.trim() && projectId)
                  void submit()
                if (e.key === 'Escape')
                  onClose()
              }}
              placeholder="prompt.md"
              disabled={pending || projects.length === 0}
            />
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || !filename.trim() || !projectId}
            onClick={() => void submit()}
          >
            创建
          </Button>
        </div>
      </div>
    </div>
  )
}

export function NewPromptDialog({ open, onClose, onCreated }: NewPromptDialogProps) {
  if (!open)
    return null

  return <NewPromptDialogBody key="new-prompt" onClose={onClose} onCreated={onCreated} />
}
