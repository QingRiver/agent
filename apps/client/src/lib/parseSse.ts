export async function consumeSse(
  response: Response,
  onPayload: (payload: unknown) => void,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader)
    throw new Error('ReadableStream not supported')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame
        .split('\n')
        .find(row => row.startsWith('data: '))

      if (!line)
        continue

      const payload = line.slice(6).trim()
      if (payload === '[DONE]')
        return

      onPayload(JSON.parse(payload))
    }
  }
}
