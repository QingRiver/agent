import type { RetrievedChunk } from '../types'
import { env } from '@agent/env'
import { z } from 'zod'
import { chatCompletionJson } from '../utils/chatCompletion'

export type LlmFallbackDecision = 'reject' | 'clarify' | 'retry_wider'

const FallbackSchema = z.object({
  decision: z.enum(['reject', 'clarify', 'retry_wider']),
  message: z.string(),
})

export async function llmFallbackDecision(
  query: string,
  topChunks: RetrievedChunk[],
): Promise<{ decision: LlmFallbackDecision, message: string }> {
  const contextPreview = topChunks
    .slice(0, 3)
    .map((chunk, index) => `[${index + 1}] ${chunk.raw_text.slice(0, 200)}`)
    .join('\n')

  return chatCompletionJson({
    system: [
      '你是知识库检索质量评估助手。',
      '当 rerank 最高分过低时，判断应如何处理用户问题。',
      '仅输出 JSON：{"decision":"reject"|"clarify"|"retry_wider","message":"给用户的中文说明"}',
      '- reject：知识库明显无法回答',
      '- clarify：问题含糊，需要追问',
      '- retry_wider：可尝试放宽召回重试',
    ].join('\n'),
    user: [
      `用户问题：${query}`,
      `top1 rerank 分数：${topChunks[0]?.rerank_score ?? topChunks[0]?.score ?? 0}（阈值 ${env.KB_RERANK_MIN_SCORE}）`,
      '候选片段预览：',
      contextPreview || '（无）',
    ].join('\n'),
    schema: FallbackSchema,
    fallback: {
      decision: 'reject',
      message: '知识库中未找到足够相关的内容，请换个问法或补充更多背景。',
    },
  })
}
