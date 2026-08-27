/**
 * 写入 kb 种子数据到 env.KB_COLLECTION（业务流：ingestFiles → commit）。
 * 用法：pnpm --filter server exec tsx scripts/seed-kb.ts
 */
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { env } from '@agent/env'
import { bootstrapDatabases } from '../src/db/bootstrap'
import { KbService } from '../src/service/kb'
import { ProjectService } from '../src/service/project'

const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/kb/fixtures/e2e-policy.md',
)

const SEED_OWNER = 'e2e-seed'

async function main(): Promise<void> {
  await bootstrapDatabases()

  const kbId = env.KB_COLLECTION
  const proj = await ProjectService.createProject(SEED_OWNER, { name: 'seed-kb' })
  const kbDir = await ProjectService.createDir(SEED_OWNER, { parentId: proj.id, name: 'kb' })
  await KbService.mark(SEED_OWNER, kbDir.id)
  const buffer = Buffer.from(await readFile(FIXTURE))
  const items = await KbService.ingestFiles({
    userId: SEED_OWNER,
    files: [{ buffer, filename: 'e2e-policy.md' }],
    owner: SEED_OWNER,
    tags: ['seed'],
    mountDirId: kbDir.id,
  })
  const item = items[0]
  if (!item)
    throw new Error('ingestFiles 未返回文档')

  if (item.skipped) {
    console.log('[devops/e2e/kb] draft already up-to-date', item.docId, item.mountDirId)
  }
  else {
    console.log('[devops/e2e/kb] drafted', item.docId, item.mountDirId)
  }

  const doc = await KbService.getDoc(item.docId)
  if (!doc)
    throw new Error(`doc ${item.docId} missing after ingest`)

  if (doc.indexingStatus === 'completed' && doc.draftHash === doc.publishedHash) {
    console.log('[devops/e2e/kb] already committed, skip', item.docId)
    return
  }

  const committed = await KbService.commit(item.docId, { skipEnrich: true })
  console.log('[devops/e2e/kb] committed', committed.id, committed.indexingStatus, `kb=${kbId}`)
}

main().catch((err) => {
  console.error('[devops/e2e/kb] failed', err)
  process.exit(1)
})
