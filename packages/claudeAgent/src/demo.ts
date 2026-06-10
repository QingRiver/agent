import { claudePackageQueryOptions, query } from './index'

async function main() {
  const stream = query({
    prompt: '你好，请检索一下当前目录有哪些文件，并给出一个简短的总结。',
    options: claudePackageQueryOptions(),
  })

  for await (const message of stream) {
    if (message.type === 'result' && message.subtype === 'success')
      console.log(message.result)

    if (message.type === 'assistant')
      console.log(JSON.stringify(message.message.content, null, 2))
  }
}

main().catch(console.error)
