export interface EditorQuote {
  id: string
  text: string
  from: number
  to: number
}

export function formatQuotesForMessage(quotes: EditorQuote[], userText: string): string {
  if (quotes.length === 0)
    return userText
  const blocks = quotes.map(q => `【编辑器选区】\n${q.text}`).join('\n\n')
  return `${blocks}\n\n${userText}`
}

/** 发送/Apply 前：偏移处文本仍与 chip 一致 */
export function filterFreshQuotes(doc: string, quotes: EditorQuote[]): EditorQuote[] {
  return quotes.filter(q => q.from >= 0 && q.to <= doc.length && doc.slice(q.from, q.to) === q.text)
}
