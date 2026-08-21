import { z } from 'zod'

export function formatErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError)
    return err.issues.map(issue => issue.message).join('; ')
  if (err instanceof Error)
    return err.message
  return String(err)
}
