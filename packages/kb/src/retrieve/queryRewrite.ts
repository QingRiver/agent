import { z } from 'zod'
import { chatCompletionJson } from '../utils/chatCompletion'

const RewriteSchema = z.object({
  queries: z.array(z.string()).min(1).max(2),
})

export async function rewriteQuery(userQuery: string): Promise<string[]> {
  const trimmed = userQuery.trim()
  if (!trimmed)
    return []

  const parsed = await chatCompletionJson({
    system: [
      '你是知识库查询改写助手。',
      '保留用户原意，优先输出 1 条查询；仅在问题明显缺实体/时间时最多补 1 条。',
      '不要臆造用户未提及的场景（如税务 UKey、手机 App 等）。',
      '保持检索友好，避免口语化。',
      '仅输出 JSON：{"queries":["查询1"]}',
    ].join('\n'),
    user: trimmed,
    schema: RewriteSchema,
    fallback: { queries: [trimmed] },
  })

  const queries = parsed.queries.map(query => query.trim()).filter(Boolean)
  if (!queries.length)
    return [trimmed]

  const unique = [...new Set([trimmed, ...queries])]
  return unique.slice(0, 2)
}
