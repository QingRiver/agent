import { z } from 'zod'

/**
 * dirs / projects 在线 API 的 wire 契约（zod）。
 *
 * 统一 dirs 树（project=根 / dir=子节点）。project/folder 退出 GTD sync，
 * 改走在线 Dir API（POST，/:id/<action>）。task 经 mount_dir_id 挂载到 dirs 节点；
 * 所属项目在客户端经 walkToProjectRoot(mountDirId) 派生（gtd_tasks 无 project_id 列）。
 *
 * 端点见 routes/project.ts：POST /projects、/dirs、/dirs/list、/projects/list、
 * /dirs/:id/{rename,move,acl,delete}。
 */

const id = z.uuid()
const name = z.string().min(1).max(200)
/** fractional indexing 排序；缺省 0 */
const sortOrder = z.number().optional().default(0)

/** 创建 project 根（kind=project, parentId=null） */
export const ProjectCreateSchema = z.object({
  name,
  sortOrder,
})
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>

/** 创建 dir 子节点（kind=dir, 须有 parent） */
export const DirCreateSchema = z.object({
  parentId: id.describe('父 dir/project id（须 kind=project 或 dir）'),
  name,
  sortOrder,
})
export type DirCreate = z.infer<typeof DirCreateSchema>

export const DirRenameSchema = z.object({ name })
export type DirRename = z.infer<typeof DirRenameSchema>

/** 重排（仅改 sortOrder，不动结构；project 根不可 move 但可 reorder） */
export const DirReorderSchema = z.object({ sortOrder: z.number() })
export type DirReorder = z.infer<typeof DirReorderSchema>

/** 移动 dir 到新父（跨 project 级联子树 dirs + task projectId） */
export const DirMoveSchema = z.object({
  newParentId: id,
  sortOrder,
})
export type DirMove = z.infer<typeof DirMoveSchema>

/** 更新 ACL（v1 单用户期骨架，owner 恒过）。四权限位缺省 false，对齐 @agent/project AclEntry */
export const DirUpdateAclSchema = z.object({
  acl: z.record(z.string(), z.object({
    traverse: z.boolean().default(false),
    read: z.boolean().default(false),
    write: z.boolean().default(false),
    admin: z.boolean().default(false),
  })),
})
export type DirUpdateAcl = z.infer<typeof DirUpdateAclSchema>

export const DirIdParamSchema = z.object({ id })
