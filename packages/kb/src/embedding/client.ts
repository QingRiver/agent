import { env } from '@agent/env'

export interface EmbeddingClientOptions {
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

/** 去掉孤立 surrogate，避免 slice 切坏 emoji 后上游 embeddings 直接 400 */
export function sanitizeEmbedText(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

export async function embedTexts(
  texts: string[],
  options: EmbeddingClientOptions = {},
): Promise<number[][]> {
  if (!texts.length)
    return []

  const apiKey = requireApiKey(options.apiKey)
  const baseUrl = options.baseUrl ?? env.SILICONFLOW_BASE_URL
  const model = options.model ?? env.KB_EMBEDDING_MODEL
  const input = texts.map(sanitizeEmbedText)

  const response = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`SiliconFlow embeddings failed (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    data: Array<{ embedding: number[], index: number }>
  }

  return json.data
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding)
}

export async function embedQuery(
  query: string,
  options?: EmbeddingClientOptions,
): Promise<number[]> {
  const [vector] = await embedTexts([query], options)
  if (!vector)
    throw new Error('embedding 返回为空')
  return vector
}
