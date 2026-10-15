import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { CodeCard } from './CodeCard'

const DEMO_SOURCE = `
export default function Card() {
  const { info, isLoading, triggerAction } = useCardContext()
  const [text, setText] = useState('')

  if (isLoading) {
    return <div className="p-4 text-sm text-neutral-500">加载中...</div>
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h3 className="text-lg font-bold text-neutral-900">{info.title}</h3>
      <input
        className="w-full rounded border border-neutral-300 px-2 py-1"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="输入内容..."
      />
      <button
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
        type="button"
        onClick={() => triggerAction('submit', { text })}
      >
        提交
      </button>
    </div>
  )
}
`.trim()

function SubmitDemo() {
  const [lastAction, setLastAction] = useState('尚未提交')

  return (
    <div className="flex w-80 flex-col gap-3">
      <CodeCard
        code={DEMO_SOURCE}
        info={{ title: '示例卡片' }}
        onAction={(actionName, payload) => {
          setLastAction(`${actionName} ${JSON.stringify(payload)}`)
        }}
      />
      <p className="text-sm text-neutral-600">
        {lastAction}
      </p>
    </div>
  )
}

const meta = {
  title: 'CodeCard',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta

type Story = StoryObj

export const Submit: Story = {
  name: '提交',
  render: () => <SubmitDemo />,
}
