import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'

export function getRequiredUser(c: Context<AppEnv>): AuthUser | Response {
  const user = c.get('user')
  if (!user)
    return c.json({ error: 'Unauthorized' }, 401)
  return user
}
