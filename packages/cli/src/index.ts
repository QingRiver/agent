import { env } from '@agent/env'
import OpenAI from 'openai'

const openai = new OpenAI({
  baseURL: env.OPENAI_BASE_URL,
  apiKey: env.OPENAI_API_KEY,
})

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: 'system' as const, content: '你好,介绍一下你自己.' }],
    model: 'deepseek-v4-pro',
    reasoning_effort: 'high',
    stream: true,
  })

  let content = ''
  let reasoning = ''

  for await (const chunk of completion) {
    content += chunk.choices[0]?.delta?.content ?? ''
    if (chunk.choices[0]?.delta && 'reasoning_content' in chunk.choices[0].delta) {
      reasoning += (chunk.choices[0].delta as { reasoning_content?: string }).reasoning_content ?? ''
    }
  }

  if (reasoning)
    console.log('🧠 思考过程：\n', reasoning)

  console.log('📝 回复：\n', content)
}

main()
