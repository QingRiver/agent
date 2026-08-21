declare module 'react-server-dom-webpack/client' {
  export function createFromReadableStream<T = unknown>(
    stream: ReadableStream<Uint8Array>,
    options?: {
      callServer?: (...args: unknown[]) => unknown
      temporaryReferences?: unknown
      findSourceMapURL?: (filename: string, environmentName: string) => string | null
      replayConsoleLogs?: boolean
      environmentName?: string
    },
  ): Promise<T>

  export function createFromFetch<T = unknown>(
    promise: Promise<Response>,
    options?: {
      callServer?: (...args: unknown[]) => unknown
      temporaryReferences?: unknown
    },
  ): Promise<T>
}
