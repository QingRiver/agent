import { z } from 'zod'

export const KbQueryRequestSchema = z.object({
  query: z.string().min(1),
  kbId: z.string().optional(),
})

export type KbQueryRequest = z.infer<typeof KbQueryRequestSchema>

export const KbIngestPathRequestSchema = z.object({
  path: z.string().min(1),
  kbId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  vdir: z.string().optional(),
  owner: z.string().optional(),
})

export type KbIngestPathRequest = z.infer<typeof KbIngestPathRequestSchema>
