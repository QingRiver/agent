import type { KbNodeRow } from '@apis/kb-api'
import { KB_DEFAULT_ID, KbApi } from '@apis/kb-api'
import { Button } from '@components/ui/button'
import { KbStore } from '@stores/kb-store'
import { useAtomValue } from 'jotai'
import { ClipboardPaste, FolderUp, Loader2, Upload, X } from 'lucide-react'
import { useState } from 'react'

interface KbImportDialogProps {
  open: boolean
  onClose: () => void
}

type Tab = 'files' | 'zip' | 'text'

interface FolderPick {
  id: string | null
  path: string
}

/** 把 kb_nodes（全是文件夹）按 parentId 链 walk 成 {id, path} 列表，根级 id=null */
function flattenFolders(nodes: KbNodeRow[]): FolderPick[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const pathOf = (id: string): string => {
    const segs: string[] = []
    let cur: string | null = id
    const guard = new Set<string>()
    while (cur != null && !guard.has(cur)) {
      guard.add(cur)
      const n = byId.get(cur)
      if (!n)
        break
      segs.unshift(n.name)
      cur = n.parentId
    }
    return segs.join('/')
  }
  return [{ id: null, path: '根级' }, ...nodes.map(n => ({ id: n.id, path: pathOf(n.id) }))]
}

interface ResultRow {
  docId: string
  name: string
  vdir: string | null
  skipped: boolean
}

export function KbImportDialog({ open, onClose }: KbImportDialogProps) {
  const nodes = useAtomValue(KbStore.nodesAtom)
  const folders = flattenFolders(nodes)

  const [tab, setTab] = useState<Tab>('files')
  const [parentNodeId, setParentNodeId] = useState<string | null>(null)
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ResultRow[]>([])

  // files tab
  const [fileList, setFileList] = useState<FileList | null>(null)
  // zip tab
  const [zipFile, setZipFile] = useState<File | null>(null)
  // text tab
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

  async function onImport() {
    setError(null)
    setResults([])
    setBusy(true)
    try {
      const tagArr = parseTags()
      const parent = parentNodeId ?? undefined
      if (tab === 'files') {
        if (!fileList?.length)
          throw new Error('请选择文件')
        const selected = [...fileList]
        const zips = selected.filter(f => /\.zip$/i.test(f.name))
        const others = selected.filter(f => !/\.zip$/i.test(f.name))
        if (zips.length && others.length) {
          throw new Error('请勿混选 zip 与普通文件：压缩包请单独切到「压缩包」页签')
        }
        if (zips.length > 1)
          throw new Error('一次仅支持一个 zip 压缩包，请切到「压缩包」页签')
        if (zips.length === 1) {
          // 误在「上传」里选了 zip → 自动走目录还原路径
          const items = await KbApi.ingestZip(KB_DEFAULT_ID, zips[0]!, {
            ...(tagArr ? { tags: tagArr } : {}),
          })
          setResults(items.map(i => ({
            docId: i.docId,
            name: i.name,
            vdir: i.vdir,
            skipped: i.skipped,
          })))
        }
        else {
          const items = await KbApi.ingestFiles(KB_DEFAULT_ID, others, {
            ...(parent != null ? { parentNodeId: parent } : {}),
            ...(tagArr ? { tags: tagArr } : {}),
          })
          setResults(items.map(i => ({
            docId: i.docId,
            name: i.name,
            vdir: i.vdir,
            skipped: i.skipped,
          })))
        }
      }
      else if (tab === 'zip') {
        if (!zipFile)
          throw new Error('请选择 zip 压缩包')
        const items = await KbApi.ingestZip(KB_DEFAULT_ID, zipFile, {
          ...(tagArr ? { tags: tagArr } : {}),
        })
        setResults(items.map(i => ({
          docId: i.docId,
          name: i.name,
          vdir: i.vdir,
          skipped: i.skipped,
        })))
      }
      else {
        if (!textContent.trim() || !textName.trim())
          throw new Error('请填写标题和正文')
        const doc = await KbApi.ingestText(KB_DEFAULT_ID, {
          content: textContent,
          name: textName.trim(),
          ...(parent != null ? { parentNodeId: parent } : {}),
          ...(tagArr ? { tags: tagArr } : {}),
        })
        setResults([{ docId: doc.id, name: doc.name, vdir: doc.vdir, skipped: false }])
      }
      await KbStore.refresh()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    finally {
      setBusy(false)
    }
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
    finally {
      setBusy(false)
    }
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
          <span className="text-sm font-medium text-foreground">引入文档 → 草稿</span>
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
            <span className="mb-1 block text-xs text-muted-foreground">目标文件夹</span>
            <select
              value={parentNodeId ?? ''}
              onChange={e => setParentNodeId(e.target.value || null)}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-border"
            >
              {folders.map(f => (
                <option key={f.id ?? 'root'} value={f.id ?? ''}>
                  {f.path}
                </option>
              ))}
            </select>
          </label>

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
                选择 zip（仅导入包内 .md/.markdown，按目录还原，最多 5 层；目标文件夹不生效）
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
                  {r.vdir && <span className="truncate text-xs text-muted-foreground">{r.vdir}</span>}
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
