import type { Buffer } from 'node:buffer'
import { env } from '@agent/env'

export interface MarkitdownOptions {
  baseUrl?: string
}

export async function convertToMarkdown(
  buffer: Buffer,
  filename: string,
  options: MarkitdownOptions = {},
): Promise<string> {
  const baseUrl = options.baseUrl ?? env.KB_MARKITDOWN_URL
  const form = new FormData()
  const blob = new Blob([new Uint8Array(buffer)])
  form.append('file', blob, filename)

  const response = await fetch(`${baseUrl}/convert`, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`markitdown convert failed (${response.status}): ${body}`)
  }

  const json = await response.json() as { markdown: string }
  return json.markdown
}

export function isMarkdownFilename(filename: string): boolean {
  return /\.(?:md|markdown)$/i.test(filename)
}

export async function loadDocumentMarkdown(
  buffer: Buffer,
  filename: string,
  options?: MarkitdownOptions,
): Promise<string> {
  if (isMarkdownFilename(filename))
    return buffer.toString('utf8')
  return convertToMarkdown(buffer, filename, options)
}
