import { TextEditor } from '@components/text-editor/TextEditor'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/text-editor')({
  component: TextEditor,
})
