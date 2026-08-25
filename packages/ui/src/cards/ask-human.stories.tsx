import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import {
  AskHumanApprovalCard,
  AskHumanInputCard,
  AskHumanModalCard,
  AskHumanMultiSelectCard,
  AskHumanSelectCard,
  AskHumanUnlockCard,
} from '../cards/ask-human'

const priorityOptions = [
  { label: '高', value: 'high', description: '尽快处理' },
  { label: '中', value: 'medium' },
  { label: '低', value: 'low' },
]

const extraOptions = [
  { label: '记录审计日志', value: 'audit' },
  { label: '发送通知', value: 'notify' },
]

const meta = {
  title: 'ask_human',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta

type Story = StoryObj

export const Input: Story = {
  name: 'ask_human_input',
  render: () => (
    <AskHumanInputCard
      message="请简要描述本次操作目的"
      placeholder="例如：整理季度报表"
      onRespond={fn()}
    />
  ),
}

export const Select: Story = {
  name: 'ask_human_select',
  render: () => (
    <AskHumanSelectCard
      message="请选择优先级"
      options={priorityOptions}
      onRespond={fn()}
    />
  ),
}

export const MultiSelect: Story = {
  name: 'ask_human_multi_select',
  render: () => (
    <AskHumanMultiSelectCard
      message="请选择附加选项"
      options={extraOptions}
      onRespond={fn()}
    />
  ),
}

export const Modal: Story = {
  name: 'ask_human_modal',
  render: () => (
    <AskHumanModalCard
      title="确认操作"
      body="即将提交变更，请选择下一步。"
      actions={['继续', '取消']}
      onRespond={fn()}
    />
  ),
}

export const Approval: Story = {
  name: 'ask_human_approval',
  render: () => (
    <AskHumanApprovalCard
      message="请确认是否执行以下操作"
      details="向账户 0x123 转账 100 ETH；目的：季度资金归集"
      onRespond={fn()}
    />
  ),
}

export const Unlock: Story = {
  name: 'ask_human_unlock',
  render: () => (
    <AskHumanUnlockCard
      message="会话已锁定，确认后继续。"
      onRespond={fn()}
    />
  ),
}
