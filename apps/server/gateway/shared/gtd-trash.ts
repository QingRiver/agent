import { z } from 'zod'

/** 在线清空回收站（旁路 GTD sync outbox） */
export const TrashPurgeSchema = z.object({
  /** 要永久删除的任务 id（须已在回收站 status=deleted 且未 purge） */
  taskIds: z.array(z.string().min(1)).min(1),
})
export type TrashPurgeRequest = z.infer<typeof TrashPurgeSchema>

export const TrashPurgeResponseSchema = z.object({
  purged: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
  skipped: z.array(z.object({
    id: z.string(),
    reason: z.string(),
  })),
  /** 权威增量行（含 purge tombstone），供 client merge */
  changes: z.array(z.unknown()),
  serverSyncId: z.number().int().nonnegative(),
})
export type TrashPurgeResponse = z.infer<typeof TrashPurgeResponseSchema>
