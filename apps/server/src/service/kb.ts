import type { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@agent/env'
import {
  ingestDirectory,
  ingestDocument,
  listDocumentSummaries,
  retrieveAndRerank,
} from '@agent/kb'

export class KbService {
  static resolveKbId(kbId?: string): string {
    return kbId?.trim() || env.KB_COLLECTION
  }

  static async ingestFile(
    buffer: Buffer,
    filename: string,
    options?: {
      kbId?: string
      tags?: string[]
      vdir?: string
      owner?: string
      skipEnrich?: boolean
    },
  ) {
    return ingestDocument({
      buffer,
      filename,
      kbId: KbService.resolveKbId(options?.kbId),
      ...(options?.tags ? { tags: options.tags } : {}),
      ...(options?.vdir ? { vdir: options.vdir } : {}),
      ...(options?.owner ? { owner: options.owner } : {}),
      ...(options?.skipEnrich ? { skipEnrich: options.skipEnrich } : {}),
    })
  }

  static async ingestFromPath(
    filePath: string,
    options?: {
      kbId?: string
      tags?: string[]
      vdir?: string
      owner?: string
      skipEnrich?: boolean
    },
  ) {
    const resolved = path.resolve(filePath)
    const buffer = await readFile(resolved)
    const filename = path.basename(resolved)
    return KbService.ingestFile(buffer, filename, options)
  }

  static async ingestDir(
    dirPath: string,
    options?: {
      kbId?: string
      tags?: string[]
      vdir?: string
      owner?: string
      skipEnrich?: boolean
    },
  ) {
    return ingestDirectory(
      path.resolve(dirPath),
      KbService.resolveKbId(options?.kbId),
      options,
    )
  }

  static async query(query: string, kbId?: string) {
    return retrieveAndRerank(KbService.resolveKbId(kbId), query)
  }

  static async manage(kbId?: string) {
    const collection = KbService.resolveKbId(kbId)
    const documents = await listDocumentSummaries(collection)
    return { kbId: collection, documents }
  }
}
