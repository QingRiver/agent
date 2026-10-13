import type { VersionTextRow } from '@apis/skill-api'
import type { ResourceRow } from './ResourcesTable'
import { parseFrontmatter, SKILL_ENTRY_FILENAME, VERSION_TEXT_TYPE } from '@agent/proto'
import { ProjectListPage } from '@components/project/ProjectListPage'
import { VersionTextWorkbench } from '@components/project/VersionTextWorkbench'
import { Button } from '@components/ui/button'
import { useAuth } from '@hooks/useAuth'
import { cn } from '@lib/utils'
import { DirStore } from '@stores/dir-store'
import { KbStore } from '@stores/kb-store'
import { SkillStore } from '@stores/skill-store'
import { TagsStore } from '@stores/tags-store'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NewPromptDialog } from './NewPromptDialog'
import { ResourcesTable, ResourcesToolbar } from './ResourcesTable'

const routeApi = getRouteApi('/resources')

const TABS = [
  { id: 'project' as const, label: '项目' },
  { id: 'kb' as const, label: '知识库' },
  { id: 'prompt' as const, label: '提示词库' },
  { id: 'skill' as const, label: '技能库' },
  { id: 'tools' as const, label: '工具库' },
]

type TabId = (typeof TABS)[number]['id']

function parseTagParam(tag: string | undefined): string[] {
  if (!tag?.trim())
    return []
  return tag.split(',').map(s => s.trim()).filter(Boolean)
}

function serializeTags(ids: string[]): string | undefined {
  return ids.length > 0 ? ids.join(',') : undefined
}

function firstLine(content: string): string {
  const line = content.split(/\r?\n/).find(l => l.trim().length > 0)
  return line?.trim().slice(0, 120) ?? ''
}

function filterRows(rows: ResourceRow[], q: string, selectedTagIds: string[]): ResourceRow[] {
  const needle = q.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle && !row.name.toLowerCase().includes(needle))
      return false
    if (selectedTagIds.length > 0 && !selectedTagIds.every(id => row.tagIds.includes(id)))
      return false
    return true
  })
}

/**
 * 资源库：项目 / 知识库(kbs) / 提示词(prompt) / 技能(skills) / 工具占位。
 */
export function ResourcesPage() {
  const { user } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const search = routeApi.useSearch()
  const tab: TabId = search.tab ?? 'project'
  const q = search.q ?? ''
  const promptTextId = tab === 'prompt' ? search.text : undefined
  const selectedTagIds = useMemo(() => parseTagParam(search.tag), [search.tag])

  const kbs = useAtomValue(KbStore.kbsAtom)
  const dirsById = useAtomValue(DirStore.dirsByIdAtom)
  const skills = useAtomValue(SkillStore.skillsAtom)
  const texts = useAtomValue(SkillStore.textsAtom)
  const tags = useAtomValue(TagsStore.tagsAtom)
  const tagsById = useAtomValue(TagsStore.tagsByIdAtom)
  const [createPromptOpen, setCreatePromptOpen] = useState(false)

  useEffect(() => {
    void DirStore.refresh()
    void SkillStore.refresh()
    void TagsStore.refreshTags()
    if (userId) {
      KbStore.onUserIdChange(userId)
      void KbStore.refresh()
    }
  }, [userId])

  const kbRows: ResourceRow[] = useMemo(() => {
    return kbs.map((kb) => {
      const dir = dirsById.get(kb.dirId)
      return {
        id: kb.dirId,
        name: dir?.name ?? kb.dirName ?? kb.dirId,
        description: '',
        tagIds: [],
        mountPath: dir?.vdir ?? kb.vdir ?? '',
      }
    })
  }, [dirsById, kbs])

  const promptRows: ResourceRow[] = useMemo(() => {
    return texts
      .filter(t => t.type === VERSION_TEXT_TYPE.PROMPT)
      .map((t) => {
        const dir = dirsById.get(t.mountDirId)
        const desc = t.versionDesc?.trim() || firstLine(t.content)
        return {
          id: t.id,
          name: t.filename,
          description: desc,
          tagIds: [],
          mountPath: dir?.vdir ? `${dir.vdir}/${t.filename}` : t.filename,
        }
      })
  }, [dirsById, texts])

  const skillRows: ResourceRow[] = useMemo(() => {
    return skills.map((s) => {
      const entry = texts.find(
        t => t.mountDirId === s.dirId && t.filename === SKILL_ENTRY_FILENAME,
      )
      const fm = entry ? parseFrontmatter(entry.content) : null
      return {
        id: s.id,
        name: s.code,
        description: fm?.description?.trim() || '',
        tagIds: s.tagIds ?? [],
        mountPath: s.vdir,
      }
    })
  }, [skills, texts])

  const visibleRows = useMemo(() => {
    if (tab === 'kb')
      return filterRows(kbRows, q, selectedTagIds)
    if (tab === 'prompt')
      return filterRows(promptRows, q, selectedTagIds)
    if (tab === 'skill')
      return filterRows(skillRows, q, selectedTagIds)
    return []
  }, [kbRows, promptRows, q, selectedTagIds, skillRows, tab])

  const selectedPrompt = promptTextId
    ? texts.find(t => t.id === promptTextId && t.type === VERSION_TEXT_TYPE.PROMPT)
    : undefined

  function setSearch(next: { tab?: TabId, q?: string, tag?: string | undefined, text?: string | undefined }) {
    const nextTab = next.tab ?? tab
    const switching = next.tab != null && next.tab !== tab
    void navigate({
      to: '/resources',
      search: {
        tab: nextTab,
        q: (next.q !== undefined ? next.q : q) || undefined,
        tag: switching ? undefined : (next.tag !== undefined ? next.tag : serializeTags(selectedTagIds)),
        text: nextTab === 'prompt' && !switching
          ? (next.text !== undefined ? next.text : promptTextId)
          : undefined,
      },
      replace: true,
    })
  }

  function toggleTag(tagId: string) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter(id => id !== tagId)
      : [...selectedTagIds, tagId]
    setSearch({ tag: serializeTags(next) })
  }

  function openPrompt(text: VersionTextRow) {
    void navigate({
      to: '/resources',
      search: {
        tab: 'prompt',
        q: q || undefined,
        tag: serializeTags(selectedTagIds),
        text: text.id,
      },
    })
  }

  function closePrompt() {
    void navigate({
      to: '/resources',
      search: {
        tab: 'prompt',
        q: q || undefined,
        tag: serializeTags(selectedTagIds),
      },
    })
  }

  function onRowClick(row: ResourceRow) {
    if (tab === 'kb') {
      void navigate({ to: '/kb', search: { kb: row.id } })
      return
    }
    if (tab === 'prompt') {
      const text = texts.find(t => t.id === row.id)
      if (text)
        openPrompt(text)
      return
    }
    if (tab === 'skill') {
      const skill = skills.find(s => s.id === row.id)
      if (!skill)
        return
      const projectId = DirStore.projectOf(dirsById, skill.dirId)
      if (!projectId)
        return
      void navigate({
        to: '/projects/$id',
        params: { id: projectId },
        search: { dir: skill.dirId },
      })
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-65px)] w-full max-w-5xl flex-col px-4">
      <div className="shrink-0 space-y-3 py-4">
        <div>
          <h1 className="text-lg font-semibold text-foreground">资源</h1>
          <p className="text-sm text-muted-foreground">项目、知识库、提示词、技能与工具</p>
        </div>
        <div
          role="tablist"
          aria-label="资源类型"
          className="flex h-9 w-fit rounded-lg border border-border/60 bg-muted/80 p-0.5"
        >
          {TABS.map((t) => {
            const selected = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={cn(
                  'h-full rounded-md px-3 text-xs transition-colors',
                  selected
                    ? 'bg-background font-semibold text-foreground shadow-sm'
                    : 'font-normal text-muted-foreground hover:text-foreground/80',
                )}
                onClick={() => setSearch({ tab: t.id, tag: tab === t.id ? serializeTags(selectedTagIds) : undefined })}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {tab === 'tools'
        ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              暂无表
            </div>
          )
        : tab === 'project'
          ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
                <ProjectListPage embedded />
              </div>
            )
          : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
                {tab === 'prompt' && selectedPrompt
                  ? (
                      <>
                        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                          <Button type="button" size="sm" variant="ghost" onClick={closePrompt}>
                            <ArrowLeft className="size-4" />
                            返回列表
                          </Button>
                          <span className="truncate text-sm font-medium text-foreground">{selectedPrompt.filename}</span>
                        </div>
                        <VersionTextWorkbench
                          key={selectedPrompt.id}
                          text={selectedPrompt}
                          allTags={tags}
                        />
                      </>
                    )
                  : (
                      <>
                        <ResourcesToolbar
                          q={q}
                          onQChange={value => setSearch({ q: value })}
                          tags={tags}
                          selectedTagIds={selectedTagIds}
                          onToggleTag={toggleTag}
                          showTagFilter={tab === 'skill' || selectedTagIds.length > 0 || tab === 'kb' || tab === 'prompt'}
                          action={tab === 'prompt'
                            ? (
                                <Button type="button" size="sm" onClick={() => setCreatePromptOpen(true)}>
                                  <Plus className="size-4" />
                                  新建提示词
                                </Button>
                              )
                            : undefined}
                        />
                        <ResourcesTable
                          rows={visibleRows}
                          tagsById={tagsById}
                          emptyText={tab === 'prompt' ? '暂无提示词，点击右上角新建' : '暂无数据'}
                          onRowClick={onRowClick}
                        />
                      </>
                    )}
              </div>
            )}

      <NewPromptDialog
        open={createPromptOpen}
        onClose={() => setCreatePromptOpen(false)}
        onCreated={openPrompt}
      />
    </div>
  )
}
