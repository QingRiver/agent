import type { InteractionRequest, InteractionResponse } from '@core/types'
import { TextInput } from '@inkjs/ui'
import { Box, Text, useInput } from 'ink'
import { useState } from 'react'

/**
 * 确认区(Zone2)—— 工具/权限的人机确认
 *
 * 按 request.type 分发到具体交互组件。激活期间焦点劫持到此区,
 * 输入区(Zone3)由 App 置灰失焦,杜绝双区同时收键。
 */

export function InteractionRenderer({
  request,
  onRespond,
}: {
  request: InteractionRequest
  onRespond: (response: InteractionResponse) => void
}) {
  switch (request.type) {
    case 'unlock':
      return (
        <UnlockInteraction
          message={request.message}
          key_={request.key}
          onConfirm={() => onRespond({ type: 'unlock', payload: undefined })}
        />
      )
    case 'select':
      return (
        <SelectInteraction
          message={request.message}
          options={request.options}
          multiple={false}
          onConfirm={v => onRespond({ type: 'select', payload: { value: v as string } })}
        />
      )
    case 'multiSelect':
      return (
        <SelectInteraction
          message={request.message}
          options={request.options}
          multiple
          onConfirm={v => onRespond({ type: 'multiSelect', payload: { values: v as string[] } })}
        />
      )
    case 'modal':
      return (
        <ModalInteraction
          title={request.title}
          body={request.body}
          actions={request.actions}
          onSelect={action => onRespond({ type: 'modal', payload: { action } })}
        />
      )
    case 'input':
      return (
        <InputInteraction
          message={request.message}
          {...(request.placeholder != null ? { placeholder: request.placeholder } : {})}
          onSubmit={value => onRespond({ type: 'input', payload: { value } })}
        />
      )
  }
}

// ==========================================
// 交互组件
// ==========================================

function UnlockInteraction({
  message,
  key_,
  onConfirm,
}: {
  message: string
  key_: string
  onConfirm: () => void
}) {
  useInput((input) => {
    if (input === key_)
      onConfirm()
  })
  return (
    <Box>
      <Text dimColor>
        {message}
      </Text>
    </Box>
  )
}

function SelectInteraction({
  message,
  options,
  multiple,
  onConfirm,
}: {
  message: string
  options: Array<{ label: string, value: string, description?: string }>
  multiple: boolean
  onConfirm: (value: string | string[]) => void
}) {
  const [cursor, setCursor] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor(prev => (prev > 0 ? prev - 1 : options.length - 1))
    }
    else if (key.downArrow) {
      setCursor(prev => (prev < options.length - 1 ? prev + 1 : 0))
    }
    else if (input === ' ') {
      if (multiple) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(cursor))
            next.delete(cursor)
          else
            next.add(cursor)
          return next
        })
      }
    }
    else if (key.return) {
      if (multiple) {
        const values = Array.from(selected).sort().map(i => options[i]!.value)
        onConfirm(values.length > 0 ? values : [options[cursor]!.value])
      }
      else {
        onConfirm(options[cursor]!.value)
      }
    }
  })

  return (
    <Box flexDirection="column">
      <Text bold>
        {message}
      </Text>
      {options.map((opt, i) => {
        const isCursor = i === cursor
        const isSelected = selected.has(i)

        let prefix: string
        if (multiple)
          prefix = isSelected ? '■' : '□'
        else
          prefix = isCursor ? '★' : '☆'

        return (
          <Box key={opt.value}>
            <Text {...(isCursor ? { color: 'cyan' as const } : {})}>
              {`${isCursor ? '▸' : ' '} ${prefix} ${opt.label}`}
            </Text>
            {opt.description && (
              <Text dimColor>
                {` — ${opt.description}`}
              </Text>
            )}
          </Box>
        )
      })}
      {multiple && (
        <Text dimColor>
          空格选择 · 回车确认
        </Text>
      )}
    </Box>
  )
}

function ModalInteraction({
  title,
  body,
  actions,
  onSelect,
}: {
  title: string
  body: string
  actions: string[]
  onSelect: (action: string) => void
}) {
  const [cursor, setCursor] = useState(0)

  useInput((_input, key) => {
    if (key.leftArrow) {
      setCursor(prev => (prev > 0 ? prev - 1 : actions.length - 1))
    }
    else if (key.rightArrow) {
      setCursor(prev => (prev < actions.length - 1 ? prev + 1 : 0))
    }
    else if (key.return) {
      onSelect(actions[cursor]!)
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">
        {title}
      </Text>
      <Text>
        {body}
      </Text>
      <Box marginTop={1}>
        {actions.map((action, i) => (
          <Box key={action} marginRight={2}>
            <Text {...(i === cursor ? { color: 'cyan' as const } : {})}>
              {i === cursor ? `[ ${action} ]` : `  ${action}  `}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function InputInteraction({
  message,
  placeholder,
  onSubmit,
}: {
  message: string
  placeholder?: string
  onSubmit: (value: string) => void
}) {
  return (
    <Box flexDirection="column">
      <Text bold>
        {message}
      </Text>
      <TextInput
        placeholder={placeholder ?? ''}
        onSubmit={onSubmit}
      />
    </Box>
  )
}
