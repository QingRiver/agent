/**
 * 同步接口的 wire 契约：一次请求 = 上传本机未确认事务 + 拉取 afterSeq 之后的变化。
 */
import { z } from 'zod'
import { SnapshotSchema } from './snapshot'
import { StoredTransactionSchema, TransactionSchema } from './txn'

export const SyncRequestSchema = z
  .object({
    clientId: z.string().min(1),
    /** 设备已重放到的 seq。 */
    afterSeq: z.number().int().nonnegative(),
    /** 本机未确认事务，按 clientSeq 升序。 */
    transactions: z.array(TransactionSchema),
  })
  .refine(req => req.transactions.every(t => t.clientId === req.clientId), {
    message: '事务的 clientId 必须与请求一致',
  })

export const SyncResponseSchema = z.object({
  ackedClientSeq: z.number().int().nonnegative(),
  resendFrom: z.number().int().min(1).nullable(),
  snapshot: SnapshotSchema.nullable(),
  transactions: z.array(StoredTransactionSchema),
})

export type SyncRequest = z.infer<typeof SyncRequestSchema>
export type SyncResponse = z.infer<typeof SyncResponseSchema>
