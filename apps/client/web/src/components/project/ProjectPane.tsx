import type { SkillRow, VersionTextRow } from '@apis/skill-api'
import type { TagRow } from '@apis/tags-api'
import type { ProjectSelection } from './ProjectFileTree'
import { SKILL_ENTRY_FILENAME } from '@agent/proto'
import { KbDocTagsBar } from '@components/kb/KbDocTagsBar'
import { BookMarked, Sparkles } from 'lucide-react'
import { VersionTextWorkbench } from './VersionTextWorkbench'

interface ProjectPaneProps {
  selection: ProjectSelection | null
  folderName?: string
  folderKind?: string
  skill?: SkillRow | null
  text?: VersionTextRow | null
  docTagIds?: string[]
  taskTagIds?: string[]
  allTags: TagRow[]
  isKbRoot?: boolean
  enclosingKbDirId?: string | null
  onOpenKb: (dirId: string) => void
  onOpenDoc: (docId: string) => void
  onChangeSkillTags: (skillId: string, tagIds: string[]) => Promise<void>
  onChangeDocTags: (docId: string, tagIds: string[]) => Promise<void>
  onChangeTaskTags: (taskId: string, tagIds: string[]) => void
  onMarkSkill: (dirId: string) => Promise<void>
  onUnmarkSkill: (skillId: string) => Promise<void>
  onMarkKb: (dirId: string) => Promise<void>
  onUnmarkKb: (dirId: string) => Promise<void>
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
  isKbRoot = false,
  enclosingKbDirId = null,
  onOpenKb,
  onOpenDoc,
  onChangeSkillTags,
  onChangeDocTags,
  onChangeTaskTags,
  onMarkSkill,
  onUnmarkSkill,
  onMarkKb,
  onUnmarkKb,
}: ProjectPaneProps) {
  if (!selection)
    return <p className="p-4 text-sm text-muted-foreground">选择左侧树节点</p>

  if (selection.kind === 'folder') {
    const inKb = enclosingKbDirId != null
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <h3 className="text-sm font-medium">{folderName}</h3>
        {isKbRoot && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
              onClick={() => onOpenKb(selection.id)}
            >
              <BookMarked className="size-3" />
              进入知识库
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
              onClick={() => void onUnmarkKb(selection.id)}
            >
              卸标知识库
            </button>
          </div>
        )}
        {inKb && !isKbRoot && (
          <button
            type="button"
            className="inline-flex items-center gap-1 self-start rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
            onClick={() => onOpenKb(enclosingKbDirId)}
          >
            <BookMarked className="size-3" />
            进入知识库
          </button>
        )}
        {!inKb && skill
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
          : !inKb && folderKind === 'dir'
              ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => void onMarkSkill(selection.id)}
                    >
                      <Sparkles className="size-3" />
                      {`升级为 Skill（写入 ${SKILL_ENTRY_FILENAME}）`}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
                      onClick={() => void onMarkKb(selection.id)}
                    >
                      <BookMarked className="size-3" />
                      初始化知识库
                    </button>
                  </div>
                )
              : !inKb
                  ? (
                      <p className="text-xs text-muted-foreground">
                        选择子文件夹后，可升级为 Skill 或初始化知识库
                      </p>
                    )
                  : null}
      </div>
    )
  }

  if (selection.kind === 'text' && text) {
    return (
      <VersionTextWorkbench
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
        <button
          type="button"
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent"
          onClick={() => onOpenDoc(selection.id)}
        >
          打开知识库文档
        </button>
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
