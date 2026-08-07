/**
 * @agent/project — 统一 dirs 树纯领域包。
 *
 * 承载共享 Dir / Project 树的全部纯计算：内存树组装（buildDirTree）、vdir 派生、
 * walkToProjectRoot、祖先链/子树度量、move/delete 前置校验、ACL traverse、挂载继承。
 *
 * Phase 0：契约冻结 + 单测钉死 §7.1 级联语义。无 IO、无 DB、无 server 耦合、无 ltree。
 * 结构靠 parentId 链表达，层级查询走「按 projectId 拉全树 + buildDirTree 内存组装」。
 * 关键不变量：rename 不动结构（parentId 不变）；move 改 parentId + 重算子树 vdir；
 * 跨 project move 级联子树 dirs + 挂载实体 projectId；delete v1 须空。
 */

export * from './acl'
export * from './dir'
export * from './mount'
export * from './schema'
export * from './tree'
export * from './types'
export * from './vdir'
