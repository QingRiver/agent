import type { AclGrants, DirRow } from './schema'
import { ACL_PERM } from './types'

/**
 * ACL 权限查询（Linux 式 dir 级）。
 *
 * v1 最简：逐访问 walk 祖先链，不 memoize / 不物化权限表。单用户期 grants 空、
 * owner 恒过。move 保留节点自身 ACL（类 `mv`），ACL 不随结构移动改变——本模块
 * 只读 grants，不修改，天然满足「ACL 随节点走」。
 */

/** 单节点单权限查询 */
export function hasPermission(
  grants: AclGrants,
  userId: string,
  perm: `${typeof ACL_PERM[keyof typeof ACL_PERM]}`,
): boolean {
  return grants[userId]?.[perm] === true
}

/**
 * 祖先链逐级 traverse 校验（访问节点的前置）。
 *
 * @param ancestorChain 从根到目标节点（含目标）的完整链
 * @param userId 访问者
 * @returns 全链每节点均 owner 或有 traverse 权限 → true
 *
 * owner 恒过（自身拥有的节点免 traverse 检查）。
 */
export function canTraverse(ancestorChain: DirRow[], userId: string): boolean {
  for (const node of ancestorChain) {
    if (userId === node.ownerId)
      continue
    if (!hasPermission(node.acl, userId, ACL_PERM.TRAVERSE))
      return false
  }
  return true
}
