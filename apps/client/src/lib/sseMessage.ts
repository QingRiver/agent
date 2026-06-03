export interface SseMessage {
  type: 'start' | 'update' | 'done' | 'error'
  data?: Record<string, unknown>
  message?: string
}
