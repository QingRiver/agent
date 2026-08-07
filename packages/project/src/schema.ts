import { z } from 'zod'
import { ACL_PERM, DIR_KIND } from './types'

/**
 * @agent/project 数据结构 spec —— zod schema 为唯一来源。
 *
 * 统一 dirs 树行形状：project 根（kind=project, parentId=null）+ dir 子树。
 * 在线权威表（不进 GTD 离线 sync）；task/doc 经 `mount_dir_id` 列挂载。
 *
 * 结构靠 `parentId` 链表达（无 path 物化列）；层级查询由 service 层
 * 「按 `projectId` 拉全树 + buildDirTree 内存组装」完成。`projectId` 是
 * walkToRoot(parentId) 派生的冗余缓存（server 维护，非 LWW）：project 根 = 自身 id，
 * dir = 父的 projectId；跨 project move 级联更新子树所有 dirs + 挂载实体的 projectId。
 * `vdir` = name 链派生（Qdrant payload + 展示）；rename/move 均重算。
 */

// ---------- 枚举 schema（从 const object 派生） ----------

export const DirKindSchema = z
  .enum(DIR_KIND)
  .describe('节点类型。project=根（parentId 恒 null）；dir=子节点（须有 parent）')

export const AclPermSchema = z
  .enum(ACL_PERM)
  .describe('ACL 权限位。traverse/read/write/admin；祖先链须逐级 traverse，owner 恒过')

// ---------- ACL ----------

/** 单用户在某 dir 节点上的权限集 */
export const AclEntrySchema = z.object({
  traverse: z.boolean().default(false),
  read: z.boolean().default(false),
  write: z.boolean().default(false),
  admin: z.boolean().default(false),
})

/** dir 节点 ACL：userId → 权限集。v1 单用户期为空对象（owner 恒过） */
export const AclGrantsSchema = z.record(z.string(), AclEntrySchema).default({})

export type AclEntry = z.infer<typeof AclEntrySchema>
export type AclGrants = z.infer<typeof AclGrantsSchema>

// ---------- Dir 行 ----------

/**
 * 统一 dirs 表行（纯领域形状，不耦合 drizzle）。
 *
 * 结构靠 `parentId` 链表达（**无 ltree/path 物化列**）。service 层「按 projectId 拉全树」
 * 后用 `buildDirTree` 在内存组装，所有层级判断（防环/depth/walk）在内存做。
 * `projectId` = 冗余缓存 = walkToRoot(parentId) 到 project 根；project 根 = 自身 id；
 * server 维护；rename 不动结构（parentId/projectId 不变），跨 project move 才级联翻新。
 * `vdir` = name 链派生（Qdrant payload + 展示）；rename/move 均重算。
 */
export const DirRowSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  kind: DirKindSchema,
  name: z.string().min(1),
  sortOrder: z.number(),
  /** 冗余缓存 = walkToRoot(parentId) 到 project 根；project 根 = 自身 id；server 维护 */
  projectId: z.string().min(1),
  vdir: z.string().min(1),
  acl: AclGrantsSchema,
  ownerId: z.string().min(1),
  etag: z.number().int().nonnegative(),
  deleted: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable(),
})

export type DirRow = z.infer<typeof DirRowSchema>

/** 软删 tombstone 视为不可见；纯函数默认只处理未删行 */
export const isLive = (dir: Pick<DirRow, 'deleted'>): boolean => !dir.deleted
