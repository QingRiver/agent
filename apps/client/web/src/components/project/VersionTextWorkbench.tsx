import type { SkillRow, VersionTextRow } from '@apis/skill-api'
import type { TagRow } from '@apis/tags-api'
import { KbDocTagsBar } from '@components/kb/KbDocTagsBar'
import { KbSourceEditor } from '@components/kb/KbSourceEditor'
import { SkillStore } from '@stores/skill-store'
import { Pencil, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { VersionTextVersionStrip } from './VersionTextVersionStrip'

interface VersionTextWorkbenchProps {
  text: VersionTextRow
  skill?: SkillRow | null
  allTags: TagRow[]
  onChangeSkillTags: (skillId: string, tagIds: string[]) => Promise<void>
}

/**
 * version_text 详情：左窄条切版本；仅草稿 + 编辑态可改；无锁。
 */
export function VersionTextWorkbench({
  text,
  skill,
  allTags,
  onChangeSkillTags,
}: VersionTextWorkbenchProps) {
  const [versions, setVersions] = useState<VersionTextRow[]>([])
  const [activeVersion, setActiveVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(text.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [versionDesc, setVersionDesc] = useState('日常更新')

  const draft = versions.find(v => v.version === 0) ?? null
  const published = versions
    .filter(v => v.version > 0)
    .slice()
    .sort((a, b) => b.version - a.version)
  const active = versions.find(v => v.version === activeVersion) ?? draft
  const isHistory = activeVersion > 0
  const isEditing = !isHistory && editing

  async function reloadVersions(): Promise<VersionTextRow[]> {
    const rows = await SkillStore.listVersions(text.mountDirId, text.filename)
    setVersions(rows)
    return rows
  }

  useEffect(() => {
    let cancelled = false
    void SkillStore.listVersions(text.mountDirId, text.filename)
      .then((rows) => {
        if (cancelled)
          return
        setVersions(rows)
        const d = rows.find(v => v.version === 0)
        if (d)
          setDraftContent(d.content)
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [text.mountDirId, text.filename])

  const displayContent = isHistory
    ? (active?.content ?? '')
    : draftContent

  function selectDraft() {
    setActiveVersion(0)
    setEditing(false)
  }

  function selectVersion(version: number) {
    setActiveVersion(version)
    setEditing(false)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    }
    catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    // React Compiler 尚不支持 try/finally
    setBusy(false)
  }

  async function saveDraft() {
    await run(async () => {
      const saved = await SkillStore.upsertText({
        dirId: text.mountDirId,
        filename: text.filename,
        content: draftContent,
        type: text.type,
      })
      setDraftContent(saved.content)
      await reloadVersions()
    })
  }

  async function publish() {
    const desc = versionDesc.trim()
    if (!desc)
      return
    await run(async () => {
      if (draftContent !== draft?.content) {
        await SkillStore.upsertText({
          dirId: text.mountDirId,
          filename: text.filename,
          content: draftContent,
          type: text.type,
        })
      }
      await SkillStore.publishText({
        dirId: text.mountDirId,
        filename: text.filename,
        versionDesc: desc,
      })
      setPublishOpen(false)
      setVersionDesc('日常更新')
      setEditing(false)
      await reloadVersions()
    })
  }

  async function restoreToDraft() {
    if (!active || active.version === 0)
      return
    await run(async () => {
      const saved = await SkillStore.upsertText({
        dirId: text.mountDirId,
        filename: text.filename,
        content: active.content,
        type: text.type,
      })
      setDraftContent(saved.content)
      await reloadVersions()
      setActiveVersion(0)
      setEditing(true)
    })
  }

  function cancelEdit() {
    setDraftContent(draft?.content ?? text.content)
    setEditing(false)
  }

  return (
    <div className="flex min-h-0 flex-1">
      <VersionTextVersionStrip
        draft={draft}
        published={published}
        activeVersion={activeVersion}
        onSelectDraft={selectDraft}
        onSelectVersion={selectVersion}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={`flex items-center justify-between gap-2 border-b border-border px-3 py-2 ${
          isEditing ? 'bg-background' : 'bg-muted/40'
        }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-xs font-medium text-foreground">{text.filename}</span>
              <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
                {text.type}
              </span>
              {isHistory
                ? (
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {`历史 v${activeVersion}`}
                    </span>
                  )
                : isEditing
                  ? (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Pencil className="size-2.5" />
                        编辑中
                      </span>
                    )
                  : (
                      <span className="rounded border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                        只读预览
                      </span>
                    )}
            </div>
            {error && <p className="mt-0.5 text-[11px] text-destructive">{error}</p>}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {isHistory
              ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40"
                    onClick={() => void restoreToDraft()}
                  >
                    <RotateCcw className="size-3" />
                    恢复到草稿
                  </button>
                )
              : (
                  <>
                    {!isEditing
                      ? (
                          <button
                            type="button"
                            disabled={busy || !draft}
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                            onClick={() => setEditing(true)}
                          >
                            编辑
                          </button>
                        )
                      : (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                              onClick={cancelEdit}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={busy || draftContent === (draft?.content ?? text.content)}
                              className="rounded-md bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40"
                              onClick={() => void saveDraft()}
                            >
                              保存
                            </button>
                          </>
                        )}
                    <button
                      type="button"
                      disabled={busy || !draft}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
                      onClick={() => {
                        setVersionDesc('日常更新')
                        setPublishOpen(true)
                      }}
                    >
                      提交版本
                    </button>
                  </>
                )}
          </div>
        </div>

        {skill && (
          <div className="border-b border-border px-3 py-2">
            <KbDocTagsBar
              tagIds={skill.tagIds ?? []}
              allTags={allTags}
              onChangeTagIds={ids => onChangeSkillTags(skill.id, ids)}
            />
          </div>
        )}

        {publishOpen && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <label className="min-w-[12rem] flex-1 text-xs">
              <span className="mb-1 block text-muted-foreground">版本描述</span>
              <input
                value={versionDesc}
                onChange={e => setVersionDesc(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
                placeholder="日常更新"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
              onClick={() => setPublishOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy || !versionDesc.trim()}
              className="rounded-md bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40"
              onClick={() => void publish()}
            >
              发布
            </button>
          </div>
        )}

        <KbSourceEditor
          value={displayContent}
          onChange={setDraftContent}
          docId={`${text.mountDirId}:${text.filename}:v${activeVersion}`}
          readOnly={!isEditing}
        />
      </div>
    </div>
  )
}
