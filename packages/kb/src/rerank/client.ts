import { env } from '@agent/env'

export interface RerankDocument {
  id: string
  text: string
}

export interface RerankResult {
  id: string
  relevance_score: number
  index: number
}

export interface RerankClientOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
}

function requireApiKey(apiKey?: string): string {
  const key = apiKey ?? env.SILICONFLOW_API_KEY
  if (!key)
    throw new Error('SILICONFLOW_API_KEY 未设置')
  return key
}

export async function rerankDocuments(
  query: string,
  documents: RerankDocument[],
  topK = env.KB_RERANK_TOPK,
  options: RerankClientOptions = {},
): Promise<RerankResult[]> {
  if (!documents.length)
    return []

  const apiKey = requireApiKey(options.apiKey)
  const baseUrl = options.baseUrl ?? env.SILICONFLOW_BASE_URL
  const model = options.model ?? env.KB_RERANK_MODEL

  const response = await fetch(`${baseUrl}/v1/rerank`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      query,
      documents: documents.map(doc => doc.text),
      top_n: Math.min(topK, documents.length),
      return_documents: false,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`SiliconFlow rerank failed (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    results: Array<{ index: number, relevance_score: number }>
  }

  return json.results.map((item) => {
    const doc = documents[item.index]
    return {
      id: doc?.id ?? String(item.index),
      relevance_score: item.relevance_score,
      index: item.index,
    }
  })
}
