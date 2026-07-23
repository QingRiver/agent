import process from 'node:process'

/**
 * 直连 Chat Completions（非 LangChain），不进入 AG-UI TEXT 流。
 * 用于 document 改稿 / 意图分类 / hunk 摘要等不应展示给用户的中间调用。
 */
export async function silentChatCompletion(params: {
  system: string
  user: string
  temperature?: number
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY ?? ''
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const model = process.env.OPENAI_MODEL ?? ''
  if (!apiKey || !model)
    throw new Error('OPENAI_API_KEY / OPENAI_MODEL 未配置')

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: params.temperature ?? 0.7,
      stream: false,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`silentChatCompletion ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}
