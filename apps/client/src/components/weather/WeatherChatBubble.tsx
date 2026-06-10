import type { WeatherChatMessage } from '@lib/parseWeatherUpdate'
import type { LucideIcon } from 'lucide-react'
import { AlertCircle, Bot, Package, User, Wrench } from 'lucide-react'

const kindMeta: Record<
  WeatherChatMessage['kind'],
  {
    label: string
    Icon: LucideIcon
    align: 'left' | 'right'
    bubble: string
    avatar: string
  }
> = {
  'user': {
    label: '你',
    Icon: User,
    align: 'right',
    bubble: 'bg-emerald-600 text-white rounded-2xl rounded-tr-sm',
    avatar: 'bg-emerald-500/20 text-emerald-300',
  },
  'assistant': {
    label: 'AI',
    Icon: Bot,
    align: 'left',
    bubble: 'bg-slate-800 text-slate-100 rounded-2xl rounded-tl-sm border border-slate-700',
    avatar: 'bg-slate-700 text-slate-200',
  },
  'tool-call': {
    label: '工具',
    Icon: Wrench,
    align: 'left',
    bubble: 'bg-amber-950/80 text-amber-100 rounded-2xl rounded-tl-sm border border-amber-700/50',
    avatar: 'bg-amber-500/15 text-amber-300',
  },
  'tool-result': {
    label: '工具',
    Icon: Package,
    align: 'left',
    bubble: 'bg-violet-950/60 text-violet-100 rounded-2xl rounded-tl-sm border border-violet-700/40',
    avatar: 'bg-violet-500/15 text-violet-300',
  },
  'error': {
    label: '错误',
    Icon: AlertCircle,
    align: 'left',
    bubble: 'bg-red-950/80 text-red-200 rounded-2xl rounded-tl-sm border border-red-700/50',
    avatar: 'bg-red-500/15 text-red-300',
  },
}

function kindTitle(kind: WeatherChatMessage['kind'], toolName?: string): string | null {
  if (kind === 'tool-call')
    return toolName ? `调用 ${toolName}` : '工具调用'
  if (kind === 'tool-result')
    return toolName ? `${toolName} 返回` : '工具结果'
  return null
}

export function WeatherChatBubble({ message }: { message: WeatherChatMessage }) {
  const meta = kindMeta[message.kind]
  const { Icon } = meta
  const title = kindTitle(message.kind, message.toolName)
  const isRight = meta.align === 'right'

  return (
    <div className={`flex gap-2 ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${meta.avatar}`}
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={2} />
      </div>
      <div className={`max-w-[min(100%,28rem)] ${isRight ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <span className={`text-xs text-slate-500 ${isRight ? 'text-right' : 'text-left'}`}>
          {meta.label}
        </span>
        <div className={`px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${meta.bubble}`}>
          {title && (
            <p className="mb-1 text-xs font-medium opacity-80">{title}</p>
          )}
          {message.content}
        </div>
      </div>
    </div>
  )
}
