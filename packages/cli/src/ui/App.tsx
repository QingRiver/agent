import { Spinner } from '@inkjs/ui'
import { Conversation } from '@ui/components/conversation'
import { InteractionRenderer } from '@ui/components/insteractions'
import { InputPrompt } from '@ui/components/line'
import { useConversation } from '@ui/hooks/use-conversation'
import { Box, useApp, useInput } from 'ink'
import { useState } from 'react'

/**
 * App —— 薄壳:组合对话区(Zone1)、确认区(Zone2)、输入区(Zone3)
 *
 * 编排逻辑见 useConversation(配置从 Context 读,App 无配置 props);
 * App 只负责渲染与输入态。
 * - 流式中输入区可编辑(提交入队,不打断当前流)
 * - 确认区激活时焦点劫持,输入区置灰(Esc 不响应)
 */
export function App() {
  const { exit } = useApp()
  const conv = useConversation()
  // input 镜像(供 Esc 判空);TextInput 非受控,通过 resetKey remount 清空
  const [input, setInput] = useState('')
  const [resetKey, setResetKey] = useState(0)

  const clearInput = () => {
    setInput('')
    setResetKey(k => k + 1)
  }

  // Esc:确认区激活时不响应;否则有输入清空、无输入退出
  useInput((_input, key) => {
    if (key.escape && conv.interaction === null) {
      if (input)
        clearInput()
      else
        exit()
    }
  })

  const handleSubmit = (value: string) => {
    conv.send(value)
    clearInput()
  }

  // pending 槽:确认区激活时不显示;工具执行时显示工具 spinner;否则思考中 spinner
  // (reasoning/text 已在流式区实时显示时,不再重复显示 spinner)
  const pending = conv.interaction !== null
    ? null
    : conv.spinnerLabel !== null
      ? <Spinner label={conv.spinnerLabel} />
      : conv.isStreaming && conv.streaming === '' && conv.reasoning === ''
        ? <Spinner label="🤖 AI 思考中..." />
        : null

  return (
    <Box flexDirection="column">
      <Conversation
        messages={conv.messages}
        streaming={conv.streaming}
        reasoning={conv.reasoning}
        pending={pending}
      />
      {conv.interaction !== null && (
        <InteractionRenderer request={conv.interaction} onRespond={conv.respond} />
      )}
      <InputPrompt
        resetKey={resetKey}
        disabled={conv.interaction !== null}
        onChange={setInput}
        onSubmit={handleSubmit}
        placeholder={conv.interaction !== null
          ? '确认中…'
          : conv.isStreaming
            ? '排队中…回车入队下一条'
            : '输入消息,回车发送'}
      />
    </Box>
  )
}
