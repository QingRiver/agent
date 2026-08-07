import { KbApi } from '@apis/kb-api'
import { Button } from '@components/ui/button'
import { DirStore } from '@stores/dir-store'
import { KbStore } from '@stores/kb-store'
import { useAtomValue } from 'jotai'
import { ClipboardPaste, FolderUp, Loader2, Upload, X } from 'lucide-react'
import { useState } from 'react'

export interface KbImportDialogProps {
  open: boolean
  /** 挂载点（project/dir id）；由侧栏节点操作打开时绑定，不可改 */
  mountDirId: string
  /** 展示用路径（如 `wiki/项目管理`） */
  mountPath: string
  onClose: () => void
}

type Tab = 'files' | 'zip' | 'text'

interface ResultRow {
  docId: string
  name: string
  mountPath: string | null
  skipped: boolean
}

export function KbImportDialog({ open, mountDirId, mountPath, onClose }: KbImportDialogProps) {
  'use no memo'

  const dirs = useAtomValue(DirStore.dirsAtom)
  const pathById = new Map(dirs.map((d) => {
    const segs: string[] = []
    let cur: string | null = d.id
    const byId = new Map(dirs.map(x => [x.id, x]))
    const guard = new Set<string>()
    while (cur != null && !guard.has(cur)) {
      guard.add(cur)
      const row = byId.get(cur)
      if (!row)
        break
      segs.unshift(row.name)
      cur = row.parentId
    }
    return [d.id, segs.join('/')] as const
  }))

  const [tab, setTab] = useState<Tab>('files')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])

  const [fileList, setFileList] = useState<FileList | null>(null)
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [textName, setTextName] = useState('')
  const [textContent, setTextContent] = useState('')

  if (!open)
    return null

  function parseTags(): string[] | undefined {
    const t = tags.split(',').map(s => s.trim()).filter(Boolean)
    return t.length ? t : undefined
  }

  function reset() {
    setResults([])
    setError(null)
    setFileList(null)
    setZipFile(null)
    setTextName('')
    setTextContent('')
  }

  function toMountPath(id: string | null | undefined): string | null {
    if (id == null)
      return null
    return pathById.get(id) ?? mountPath
  }

  async function onImport() {
    setError(null)
    setResults([])
    const selected = fileList ? [...fileList] : []
    const zips = selected.filter(f => /\.zip$/i.test(f.name))
    const others = selected.filter(f => !/\.zip$/i.test(f.name))
    const selectedZip = zipFile
    const trimmedTextName = textName.trim()
    const tagArr = parseTags()

    if (tab === 'files' && selected.length === 0) {
      setError('请选择文件')
      return
    }
    if (tab === 'files' && zips.length > 0 && others.length > 0) {
      setError('请勿混选 zip 与普通文件：压缩包请单独切到「压缩包」页签')
      return
    }
    if (tab === 'files' && zips.length > 1) {
      setError('一次仅支持一个 zip 压缩包，请切到「压缩包」页签')
      return
    }
    if (tab === 'zip' && !selectedZip) {
      setError('请选择 zip 压缩包')
      return
    }
    if (tab === 'text' && (!textContent.trim() || !trimmedTextName)) {
      setError('请填写标题和正文')
      return
    }

    setBusy(true)
    try {
      if (tab === 'files') {
        if (zips.length === 1) {
          const items = await KbApi.ingestZip(zips[0]!, {
            mountDirId,
            ...(tagArr ? { tags: tagArr } : {}),
          })
          setResults(items.map(i => ({
            docId: i.docId,
            name: i.name,
            mountPath: toMountPath(i.mountDirId),
            skipped: i.skipped,
          })))
        }
        else {
          const items = await KbApi.ingestFiles(others, {
            mountDirId,
            ...(tagArr ? { tags: tagArr } : {}),
          })
          setResults(items.map(i => ({
            docId: i.docId,
            name: i.name,
            mountPath: toMountPath(i.mountDirId),
            skipped: i.skipped,
          })))
        }
      }
      else if (tab === 'zip') {
        const items = await KbApi.ingestZip(selectedZip!, {
          mountDirId,
          ...(tagArr ? { tags: tagArr } : {}),
        })
        setResults(items.map(i => ({
          docId: i.docId,
          name: i.name,
          mountPath: toMountPath(i.mountDirId),
          skipped: i.skipped,
        })))
      }
      else {
        const doc = await KbApi.ingestText({
          content: textContent,
          name: trimmedTextName,
          mountDirId,
          ...(tagArr ? { tags: tagArr } : {}),
        })
        setResults([{ docId: doc.id, name: doc.name, mountPath: toMountPath(doc.mountDirId), skipped: false }])
      }
      await Promise.all([KbStore.refresh(), DirStore.refresh()])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  async function onBatchCommit() {
    const ids = results.map(r => r.docId)
    if (!ids.length)
      return
    setBusy(true)
    setError(null)
    try {
      await KbApi.batchCommit(ids, true)
      await KbStore.refresh()
      setResults([])
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  function openDoc(id: string) {
    KbStore.select(id)
    onClose()
  }

  const tabs: { key: Tab, label: string, icon: typeof Upload }[] = [
    { key: 'files', label: '上传', icon: Upload },
    { key: 'zip', label: '压缩包', icon: FolderUp },
    { key: 'text', label: '粘贴', icon: ClipboardPaste },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground">引入文档 → 草稿</span>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={mountPath}>
              挂载到
              {' '}
              <span className="text-foreground">{mountPath}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border p-2">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key)
                setResults([])
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
                tab === t.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">标签（逗号分隔，可选）</span>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="rust,async"
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-border"
            />
          </label>

          {tab === 'files' && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">
                选择文件（.md/.docx/.pdf/.html/.txt；zip 请用「压缩包」页签）
              </span>
              <input
                type="file"
                multiple
                accept=".md,.markdown,.docx,.pdf,.html,.htm,.txt"
                onChange={e => setFileList(e.target.files)}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-foreground hover:file:bg-muted"
              />
            </label>
          )}

          {tab === 'zip' && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">
                选择 zip（仅导入包内 .md/.markdown；目录还原到当前挂载点下，最多 5 层）
              </span>
              <input
                type="file"
                accept=".zip"
                onChange={e => setZipFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-foreground hover:file:bg-muted"
              />
            </label>
          )}

          {tab === 'text' && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">标题</span>
                <input
                  value={textName}
                  onChange={e => setTextName(e.target.value)}
                  placeholder="文档标题"
                  className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-border"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">正文（Markdown）</span>
                <textarea
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  rows={8}
                  placeholder="# 标题&#10;正文…"
                  className="w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 font-mono text-sm text-foreground outline-none focus:border-border"
                />
              </label>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {results.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                导入
                {' '}
                {results.length}
                {' '}
                篇
                {results.some(r => r.skipped) ? '（含已存在跳过）' : ''}
              </p>
              {results.map(r => (
                <div
                  key={r.docId}
                  className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.name}</span>
                  {r.mountPath && <span className="truncate text-xs text-muted-foreground">{r.mountPath}</span>}
                  {r.skipped && <span className="text-xs text-amber-700 dark:text-amber-400">跳过</span>}
                  <button
                    type="button"
                    onClick={() => openDoc(r.docId)}
                    className="rounded px-2 py-0.5 text-xs text-sky-700 hover:bg-accent dark:text-sky-300"
                  >
                    打开
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-3">
          {results.length > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void onBatchCommit()}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              批量提交
            </Button>
          )}
          <Button type="button" size="sm" disabled={busy} onClick={() => void onImport()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            引入
          </Button>
        </div>
      </div>
    </div>
  )
}
