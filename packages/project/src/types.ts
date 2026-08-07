/**
 * @agent/project 枚举常量中心。
 *
 * 统一 dirs 树（project 根 + dir 子树）的领域常量。所有枚举值以 `as const` 对象为
 * 唯一来源（语义 key + JSDoc + 中文 TEXT），`schema.ts` 的 zod enum 从中派生，
 * TS type 由 `z.infer` 派生。不在此处导出 enum type，避免与 schema.ts 重复导出冲突。
 */

// ===== 节点类型 =====
export const DIR_KIND = {
  /** 项目根（命名作用域桶，parent_id 恒 null，无 GTD facet） */
  PROJECT: 'project',
  /** 目录节点（须挂 project 或 dir 下，嵌套 ≤ MAX_DEPTH） */
  DIR: 'dir',
} as const

export const DIR_KIND_TEXT = {
  [DIR_KIND.PROJECT]: '项目',
  [DIR_KIND.DIR]: '目录',
} as const

// ===== ACL 权限位（Linux 式 dir 级，逐级 traverse） =====
export const ACL_PERM = {
  /** 穿越（访问子树须祖先链逐级 traverse） */
  TRAVERSE: 'traverse',
  /** 读（列子项 / 读挂载实体） */
  READ: 'read',
  /** 写（建/改子项、挂载实体） */
  WRITE: 'write',
  /** 管理（改名 / move / 改 ACL / 删除） */
  ADMIN: 'admin',
} as const

export const ACL_PERM_TEXT = {
  [ACL_PERM.TRAVERSE]: '穿越',
  [ACL_PERM.READ]: '读',
  [ACL_PERM.WRITE]: '写',
  [ACL_PERM.ADMIN]: '管理',
} as const

// ===== 结构不变量 =====

/** dir 嵌套深度上限（project 根 depth=0，最多再嵌 MAX_DEPTH 层 dir） */
export const MAX_DEPTH = 5
