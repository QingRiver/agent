import type { ApplyRequest } from '@agent/gtd'
import type { Context } from 'hono'
import type { AppEnv, AuthUser } from '../types'
import { applyGtd, listGtd } from '../service/gtd'

export async function listGtdHandler(c: Context<AppEnv>, user: AuthUser) {
  return c.json(await listGtd(user.id))
}

export async function applyGtdHandler(c: Context<AppEnv>, user: AuthUser, req: ApplyRequest) {
  return c.json(await applyGtd(user.id, req))
}
