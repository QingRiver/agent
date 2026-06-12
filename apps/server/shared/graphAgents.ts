import { GraphsNameSchema } from '@agent/graph'
import { z } from 'zod'

export const GraphAgentCatalogItemSchema = z.object({
  name: GraphsNameSchema,
  description: z.string(),
})
export type GraphAgentCatalogItem = z.infer<typeof GraphAgentCatalogItemSchema>

export const GraphAgentCatalogResponseSchema = z.object({
  graphs: z.array(GraphAgentCatalogItemSchema),
})
export type GraphAgentCatalogResponse = z.infer<typeof GraphAgentCatalogResponseSchema>
