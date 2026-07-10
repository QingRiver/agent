import type { Context } from 'hono'
import type { KbIngestPathRequest, KbQueryRequest } from '../../shared/kb'
import type { AppEnv } from '../types'
import { Buffer } from 'node:buffer'
import { KbService } from '../service/kb'

export class KbHandlers {
  static async ingest(c: Context<AppEnv>) {
    const contentType = c.req.header('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const body = await c.req.parseBody()
      const file = body.file
      if (!(file instanceof File))
        return c.json({ error: 'file is required' }, 400)

      const buffer = Buffer.from(await file.arrayBuffer())
      const kbId = typeof body.kbId === 'string' ? body.kbId : undefined
      const tags = typeof body.tags === 'string'
        ? body.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : undefined

      const result = await KbService.ingestFile(buffer, file.name, {
        ...(kbId ? { kbId } : {}),
        ...(tags ? { tags } : {}),
        ...(typeof body.vdir === 'string' ? { vdir: body.vdir } : {}),
        ...(typeof body.owner === 'string' ? { owner: body.owner } : {}),
      })
      return c.json({ result })
    }

    return c.json({ error: 'multipart/form-data with file field required' }, 400)
  }

  static async ingestPath(c: Context<AppEnv>, req: KbIngestPathRequest) {
    const result = await KbService.ingestFromPath(req.path, {
      ...(req.kbId ? { kbId: req.kbId } : {}),
      ...(req.tags ? { tags: req.tags } : {}),
      ...(req.vdir ? { vdir: req.vdir } : {}),
      ...(req.owner ? { owner: req.owner } : {}),
    })
    return c.json({ result })
  }

  static async query(c: Context<AppEnv>, req: KbQueryRequest) {
    const result = await KbService.query(req.query, req.kbId)
    return c.json({ result })
  }

  static async manage(c: Context<AppEnv>) {
    const kbId = c.req.query('kbId') ?? undefined
    const result = await KbService.manage(kbId)
    return c.json(result)
  }
}
