import { z } from 'zod'

export const KbCitationSchema = z.object({
  index: z.number().int().positive(),
  chunk_id: z.string(),
  source_doc_id: z.string(),
  page_number: z.number().int().optional(),
  heading_path: z.array(z.string()),
  excerpt: z.string(),
})

export type KbCitation = z.infer<typeof KbCitationSchema>

export const KbCitationsPayloadSchema = z.object({
  citations: z.array(KbCitationSchema),
})

export type KbCitationsPayload = z.infer<typeof KbCitationsPayloadSchema>

export const KB_CITATIONS_EVENT = 'kb_citations'
