import { StatusMessage, TextInput } from '@inkjs/ui'
import { Box, Text } from 'ink'

export function IntroLine({ message }: { message: string }) {
  return (
    <Box>
      <Text color="cyan">
        {'◇  '}
      </Text>
      <Text bold>
        {message}
      </Text>
    </Box>
  )
}

export function UserMessage({ content }: { content: string }) {
  return (
    <Box>
      <Text color="green">
        {'› '}
      </Text>
      <Text>
        {content}
      </Text>
    </Box>
  )
}

export function ToolResultLine({ name }: { name: string }) {
  return (
    <StatusMessage variant="info">
      {`🔧 ${name}`}
    </StatusMessage>
  )
}

export function InputPrompt({
  resetKey,
  disabled,
  onChange,
  onSubmit,
  placeholder,
}: {
  resetKey: number
  disabled?: boolean
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  placeholder?: string
}) {
  return (
    <Box>
      <Text color="cyan">
        {'› '}
      </Text>
      <TextInput
        key={resetKey}
        defaultValue=""
        onChange={onChange}
        onSubmit={onSubmit}
        {...(disabled ? { isDisabled: true } : {})}
        {...(placeholder != null ? { placeholder } : {})}
      />
    </Box>
  )
}
