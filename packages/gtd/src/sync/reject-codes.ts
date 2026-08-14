/**
 * Sync reject 稳定 code（server / client 共用解析）。
 * 用户可见文案由 Client 根据 code 组装；reason 载荷可带任务名。
 */

/** 任务已在远端 purge（物理/不可复活 tombstone）；勿 LWW 写活旧 id */
export const REMOTE_PURGED_PREFIX = 'REMOTE_PURGED:'

export function remotePurgedReason(taskName: string): string {
  return `${REMOTE_PURGED_PREFIX}${taskName}`
}

export function isRemotePurgedReason(reason: string): boolean {
  return reason.startsWith(REMOTE_PURGED_PREFIX)
}

export function parseRemotePurgedName(reason: string): string | null {
  if (!isRemotePurgedReason(reason))
    return null
  const name = reason.slice(REMOTE_PURGED_PREFIX.length)
  return name.length > 0 ? name : null
}
