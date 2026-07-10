const HEADER_FOOTER_PATTERNS = [
  /^第\s*\d+\s*页\s*\/\s*共\s*\d+\s*页\s*$/gm,
  /^Page\s+\d+\s+of\s+\d+\s*$/gim,
  /^[-—]{3,}\s*$/gm,
]

export interface CleanMarkdownOptions {
  sourceDocId: string
  baseUrl?: string
}

export function cleanMarkdown(
  markdown: string,
  options: CleanMarkdownOptions,
): string {
  let text = markdown.replace(/\r\n/g, '\n')

  for (const pattern of HEADER_FOOTER_PATTERNS)
    text = text.replace(pattern, '')

  text = normalizeRelativeLinks(text, options.baseUrl)
  text = replaceImagesWithPlaceholders(text, options.sourceDocId)
  text = collapseBlankLines(text)

  return text.trim()
}

function normalizeRelativeLinks(markdown: string, baseUrl?: string): string {
  if (!baseUrl)
    return markdown.replace(/\]\(\.\/([^)]+)\)/g, ']($1)')

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return markdown.replace(/\]\(\.\/([^)]+)\)/g, (_, path: string) => `](${normalizedBase}${path})`)
}

function replaceImagesWithPlaceholders(markdown: string, sourceDocId: string): string {
  let imageIndex = 0
  return markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt: string) => {
    imageIndex += 1
    const placeholder = `kbimg://${sourceDocId}/${imageIndex}`
    return `![${alt || `image-${imageIndex}`}](${placeholder})`
  })
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n')
}
