/**
 * 实体挂载继承（泛型，不耦合 gtd/kb）。
 *
 * task/doc/agent 经 `mount_dir_id` 列挂载到 dirs 节点。子任务默认与父同
 * `mount_dir_id`（不变量 12）；本函数表达该继承语义：
 * - `ownMountDirId === undefined`（未显式设定）→ 继承 `parentMountDirId`
 * - `ownMountDirId` 有值（含 `null` = 显式置 Inbox）→ 不覆盖
 */

/**
 * 解析子实体的实际挂载 dir。
 *
 * @param parentMountDirId 父实体的挂载 dir（null=父在 Inbox）
 * @param ownMountDirId 子实体自身的 mount_dir_id；undefined=未设→继承父
 * @returns 子实体最终挂载 dir（null=Inbox）
 */
export function inheritMount(
  parentMountDirId: string | null,
  ownMountDirId?: string | null,
): string | null {
  return ownMountDirId === undefined ? parentMountDirId : ownMountDirId
}
