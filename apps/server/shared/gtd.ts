import { GtdDocumentSchema } from '@agent/gtd'
import { z } from 'zod'

export { GtdDocumentSchema }
export type { GtdDocument } from '@agent/gtd'

export const GtdSaveDocumentSchema = z.object({
  document: GtdDocumentSchema,
})
export type GtdSaveDocument = z.infer<typeof GtdSaveDocumentSchema>
