import type { SkillRow, VersionTextRow } from '@apis/skill-api'
import type { TagRow } from '@apis/tags-api'
import type { ProjectSelection } from './ProjectFileTree'
import { SKILL_ENTRY_FILENAME } from '@agent/proto'
import { KbDocTagsBar } from '@components/kb/KbDocTagsBar'
import { KbSourceEditor } from '@components/kb/KbSourceEditor'
import { SkillStore } from '@stores/skill-store'
import { Sparkles } from 'lucide-react'
import { useState } from 'react'

interface ProjectPaneProps {
  selection: ProjectSelection | null
  folderName?: string
  folderKind?: string
  skill?: SkillRow | null
  text?: VersionTextRow | null
  docTagIds?: string[]
  taskTagIds?: string[]
  allTags: TagRow[]
  onChangeSkillTags: (skillId: string, tagIds: string[]) => Promise<void>
  onChangeDocTags: (docId: string, tagIds: string[]) => Promise<void>
  onChangeTaskTags: (taskId: string, tagIds: string[]) => void
  onMarkSkill: (dirId: string) => Promise<void>
  onUnmarkSkill: (skillId: string) => Promise<void>
}

export function ProjectPane({
  selection,
  folderName,
  folderKind,
  skill,
  text,
  docTagIds,
  taskTagIds,
  allTags,
  onChangeSkillTags,
  onChangeDocTags,
  onChangeTaskTags,
  onMarkSkill,
  onUnmarkSkill,
}: ProjectPaneProps) {
  if (!selection)
    return <p className="p-4 text-sm text-muted-foreground">选择左侧项目与树节点</p>

  if (selection.kind === 'folder') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-sm font-medium">{folderName}</h3>
        {skill
          ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Skill code：
                  <code className="ml-1">{skill.code}</code>
                </p>
                <KbDocTagsBar
                  tagIds={skill.tagIds ?? []}
                  allTags={allTags}
                  onChangeTagIds={ids => onChangeSkillTags(skill.id, ids)}
                />
                <button
                  type="button"
                  className="self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => void onUnmarkSkill(skill.id)}
                >
                  卸标（硬删子树 version_text，dirs 保留）
                </button>
              </>
            )
          : folderKind === 'dir'
            ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                  onClick={() => void onMarkSkill(selection.id)}
                >
                  <Sparkles className="size-3" />
                  {`升级为 Skill（写入 ${SKILL_ENTRY_FILENAME}）`}
                </button>
              )
            : (
                <p className="text-xs text-muted-foreground">
                  在项目里新建子文件夹后，才能升级为 Skill
                </p>
              )}
      </div>
    )
  }

  if (selection.kind === 'text' && text) {
    return (
      <VersionTextEditor
        key={text.id}
        text={text}
        skill={skill}
        allTags={allTags}
        onChangeSkillTags={onChangeSkillTags}
      />
    )
  }

  if (selection.kind === 'doc') {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm">知识库文档（正文请去知识库页）</p>
        <KbDocTagsBar
          tagIds={docTagIds ?? []}
          allTags={allTags}
          onChangeTagIds={ids => onChangeDocTags(selection.id, ids)}
        />
      </div>
    )
  }

  if (selection.kind === 'task') {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm">GTD 任务（新建/完成请去 GTD）</p>
        <KbDocTagsBar
          tagIds={taskTagIds ?? []}
          allTags={allTags}
          onChangeTagIds={async (ids) => { onChangeTaskTags(selection.id, ids) }}
        />
      </div>
    )
  }

  return <p className="p-4 text-sm text-muted-foreground">节点不可用</p>
}

function VersionTextEditor({
  text,
  skill,
  allTags,
  onChangeSkillTags,
}: {
  text: VersionTextRow
  skill?: SkillRow | null
  allTags: TagRow[]
  onChangeSkillTags: (skillId: string, tagIds: string[]) => Promise<void>
}) {
  const [draft, setDraft] = useState(text.content)
  const [saving, setSaving] = useState(false)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="truncate text-xs text-muted-foreground">{text.filename}</span>
        <button
          type="button"
          disabled={saving || draft === text.content}
          className="rounded-md bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40"
          onClick={() => {
            setSaving(true)
            void SkillStore.upsertText({
              dirId: text.mountDirId,
              filename: text.filename,
              content: draft,
            }).finally(() => setSaving(false))
          }}
        >
          保存
        </button>
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
      <KbSourceEditor value={draft} onChange={setDraft} docId={text.id} />
    </div>
  )
}
