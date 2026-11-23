import type { EntityRow, NormalizeRowsOptions, Op } from '@agent/gtd'
import { normalizeRows } from '@agent/gtd'
import { e2eFetch } from './auth'

/**
 * 测试用 GTD 客户端：经 POST /gtd/list + /gtd/apply 与服务器往返。
 */
export class GtdDevice {
  private cached: EntityRow[] = []
  private readonly token: string

  constructor(token: string) {
    this.token = token
  }

  async list(): Promise<EntityRow[]> {
    const res = await e2eFetch<{ rows: EntityRow[] }>(this.token, '/gtd/list', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    this.cached = res.rows
    return res.rows
  }

  /** 在服务器上执行 Op 并刷新本地缓存。 */
  async act(ops: Op[]): Promise<void> {
    if (ops.length === 0)
      return
    const res = await e2eFetch<{ rows: EntityRow[] }>(this.token, '/gtd/apply', {
      method: 'POST',
      body: JSON.stringify({ ops }),
    })
    this.cached = res.rows
  }

  async rows(options?: NormalizeRowsOptions): Promise<EntityRow[]> {
    await this.list()
    return normalizeRows(this.cached, options)
  }
}
