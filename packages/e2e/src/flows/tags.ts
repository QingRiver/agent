import type { EntityRow, Op } from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import { EXPLICIT_STATUS } from '@agent/gtd'
import { e2eFetch, e2eRequest, GtdDevice, signInE2E } from '../client'
import { assert } from '../support'

interface TagRow {
  id: string
  name: string
  color: string | null
}

interface KbDoc {
  id: string
  name: string
  tagIds: string[]
}

interface LinkedResource {
  id: string
  title: string
}

interface TagDeletePreview {
  docs: LinkedResource[]
  tasks: LinkedResource[]
}

interface Scenario {
  tag: TagRow
  docs: KbDoc[]
  taskIds: string[]
}

interface CleanupState {
  tagIds: Set<string>
  docIds: Set<string>
  taskIds: Set<string>
}

interface Gtd {
  token: string
  device: GtdDevice
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(value),
  }
}

async function actGtd(gtd: Gtd, ops: Op[]): Promise<void> {
  await gtd.device.act(ops)
}

async function gtdRows(gtd: Gtd, deadTagId?: string): Promise<EntityRow[]> {
  return gtd.device.rows({ isTagLive: tagId => tagId !== deadTagId })
}

function taskStatus(rows: EntityRow[], taskId: string): string | undefined {
  const task = rows.find(r => r.entity === 'task' && r.id === taskId)
  return task?.entity === 'task' ? task.data.status : undefined
}

function hasTaskTag(rows: EntityRow[], taskId: string, tagId: string): boolean {
  return rows.some(r => r.entity === 'task_tag' && !r.deleted && r.data.taskId === taskId && r.data.tagId === tagId)
}

/** 当前用户的知识库挂载点。没有就建一个项目目录并 mark。 */
async function ensureKbMount(token: string): Promise<string> {
  const listed = await e2eFetch<{ kbs: Array<{ dirId: string }> }>(
    token,
    '/kb/kbs/list',
    jsonBody({}),
  )
  const existing = listed.kbs[0]
  if (existing)
    return existing.dirId

  const project = (await e2eFetch<{ dir: { id: string } }>(
    token,
    '/projects/create',
    jsonBody({ name: `e2e-tags-${Date.now()}` }),
  )).dir
  const dir = (await e2eFetch<{ dir: { id: string } }>(
    token,
    '/dirs/create',
    jsonBody({ parentId: project.id, name: 'kb' }),
  )).dir
  await e2eFetch(token, '/kb/kbs/create', jsonBody({ dirId: dir.id }))
  return dir.id
}

async function createScenario(
  gtd: Gtd,
  cleanup: CleanupState,
  suffix: string,
  mountDirId: string,
): Promise<Scenario> {
  const { token } = gtd
  const tag = (await e2eFetch<{ tag: TagRow }>(
    token,
    '/tags/create',
    jsonBody({ name: `e2e-tags-${suffix}-${Date.now()}`, color: '#60a5fa' }),
  )).tag
  cleanup.tagIds.add(tag.id)

  const docs: KbDoc[] = []
  for (const label of ['a', 'b']) {
    const doc = (await e2eFetch<{ doc: KbDoc }>(
      token,
      '/kb/documents/create',
      jsonBody({
        mountDirId,
        name: `e2e-${suffix}-doc-${label}-${randomUUID().slice(0, 8)}`,
        content: `# ${suffix}-${label}`,
        tagIds: [tag.id],
      }),
    )).doc
    docs.push(doc)
    cleanup.docIds.add(doc.id)
  }

  const now = new Date().toISOString()
  const taskIds = [randomUUID(), randomUUID()]
  const ops: Op[] = []
  for (const [index, taskId] of taskIds.entries()) {
    ops.push({
      kind: 'create',
      id: randomUUID(),
      clientTs: now,
      taskId,
      name: `e2e-${suffix}-task-${index + 1}`,
      parentId: null,
      order: index,
      mountDirId: null,
    })
    ops.push({
      kind: 'patch',
      id: randomUUID(),
      clientTs: now,
      entity: 'task_tag',
      entityId: `${taskId}|${tag.id}`,
      patch: { taskId, tagId: tag.id },
    })
    cleanup.taskIds.add(taskId)
  }
  await actGtd(gtd, ops)

  // 从真实读接口确认两域关联均已落地。
  for (const doc of docs) {
    const actual = (await e2eFetch<{ doc: KbDoc }>(
      token,
      `/kb/documents/${doc.id}/get`,
      jsonBody({}),
    )).doc
    assert(actual.tagIds.includes(tag.id), `文档 ${doc.id} 未关联 tag ${tag.id}`)
  }
  const rows = await gtdRows(gtd)
  for (const taskId of taskIds) {
    assert(taskStatus(rows, taskId) === EXPLICIT_STATUS.ACTIVE, `GTD task ${taskId} 未创建`)
    assert(hasTaskTag(rows, taskId, tag.id), `GTD task ${taskId} 未关联 tag ${tag.id}`)
  }

  return { tag, docs, taskIds }
}

async function previewDelete(
  token: string,
  scenario: Scenario,
): Promise<TagDeletePreview> {
  const preview = await e2eFetch<TagDeletePreview>(
    token,
    `/tags/${scenario.tag.id}/delete`,
    jsonBody({ mode: 'delete_entities', dryRun: true }),
  )
  assert(
    preview.docs.map(d => d.id).sort().join(',') === scenario.docs.map(d => d.id).sort().join(','),
    `dryRun 文档列表不一致: ${JSON.stringify(preview.docs)}`,
  )
  assert(
    preview.tasks.map(t => t.id).sort().join(',') === [...scenario.taskIds].sort().join(','),
    `dryRun GTD 列表不一致: ${JSON.stringify(preview.tasks)}`,
  )
  return preview
}

async function assertDocStatus(
  token: string,
  docId: string,
  expectedStatus: number,
  removedTagId?: string,
): Promise<void> {
  const response = await e2eRequest(token, `/kb/documents/${docId}/get`, jsonBody({}))
  assert(response.status === expectedStatus, `文档 ${docId} 状态=${response.status}，期望 ${expectedStatus}`)
  if (response.ok && removedTagId) {
    const body = await response.json() as { doc: KbDoc }
    assert(!body.doc.tagIds.includes(removedTagId), `文档 ${docId} 仍绑定 tag ${removedTagId}`)
  }
}

async function assertTagDeleted(token: string, tagId: string): Promise<void> {
  const list = await e2eFetch<{ tags: TagRow[] }>(token, '/tags/list', jsonBody({}))
  assert(!list.tags.some(tag => tag.id === tagId), `已删除 tag ${tagId} 仍出现在列表`)
}

async function caseUntag(gtd: Gtd, cleanup: CleanupState, mountDirId: string): Promise<void> {
  const { token } = gtd
  const scenario = await createScenario(gtd, cleanup, 'untag', mountDirId)
  const preview = await previewDelete(token, scenario)
  assert(preview.docs.length === 2 && preview.tasks.length === 2, 'untag dryRun 资源数不正确')

  await e2eFetch<{ ok: true }>(
    token,
    `/tags/${scenario.tag.id}/delete`,
    jsonBody({ mode: 'untag' }),
  )
  cleanup.tagIds.delete(scenario.tag.id)

  for (const doc of scenario.docs)
    await assertDocStatus(token, doc.id, 200, scenario.tag.id)

  const rows = await gtdRows(gtd, scenario.tag.id)
  for (const taskId of scenario.taskIds) {
    assert(taskStatus(rows, taskId) === EXPLICIT_STATUS.ACTIVE, `untag 错删 GTD task ${taskId}`)
    assert(!hasTaskTag(rows, taskId, scenario.tag.id), `untag 后 task ${taskId} 仍显示 tag`)
  }
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case1 untag 通过')
}

async function casePartialDelete(gtd: Gtd, cleanup: CleanupState, mountDirId: string): Promise<void> {
  const { token } = gtd
  const scenario = await createScenario(gtd, cleanup, 'partial', mountDirId)
  await previewDelete(token, scenario)
  const [deletedDoc, keptDoc] = scenario.docs
  const [deletedTaskId, keptTaskId] = scenario.taskIds
  assert(deletedDoc && keptDoc && deletedTaskId && keptTaskId, 'partial 场景资源不足')

  await e2eFetch<{ ok: true }>(
    token,
    `/tags/${scenario.tag.id}/delete`,
    jsonBody({
      mode: 'delete_entities',
      docIds: [deletedDoc.id],
      taskIds: [deletedTaskId],
    }),
  )
  cleanup.tagIds.delete(scenario.tag.id)
  cleanup.docIds.delete(deletedDoc.id)

  await assertDocStatus(token, deletedDoc.id, 404)
  await assertDocStatus(token, keptDoc.id, 200, scenario.tag.id)

  const rows = await gtdRows(gtd, scenario.tag.id)
  assert(taskStatus(rows, deletedTaskId) === EXPLICIT_STATUS.DELETED, `部分删除未把 GTD task ${deletedTaskId} 移进回收站`)
  assert(taskStatus(rows, keptTaskId) === EXPLICIT_STATUS.ACTIVE, `部分删除误删 GTD task ${keptTaskId}`)
  assert(!hasTaskTag(rows, keptTaskId, scenario.tag.id), `部分删除后 task ${keptTaskId} 仍显示 tag`)
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case2 部分删除通过')
}

async function caseFullDelete(gtd: Gtd, cleanup: CleanupState, mountDirId: string): Promise<void> {
  const { token } = gtd
  const scenario = await createScenario(gtd, cleanup, 'full', mountDirId)
  const preview = await previewDelete(token, scenario)

  await e2eFetch<{ ok: true }>(
    token,
    `/tags/${scenario.tag.id}/delete`,
    jsonBody({
      mode: 'delete_entities',
      docIds: preview.docs.map(d => d.id),
      taskIds: preview.tasks.map(t => t.id),
    }),
  )
  cleanup.tagIds.delete(scenario.tag.id)
  for (const doc of scenario.docs)
    cleanup.docIds.delete(doc.id)

  for (const doc of scenario.docs)
    await assertDocStatus(token, doc.id, 404)
  const rows = await gtdRows(gtd, scenario.tag.id)
  for (const taskId of scenario.taskIds)
    assert(taskStatus(rows, taskId) === EXPLICIT_STATUS.DELETED, `全部删除未把 GTD task ${taskId} 移进回收站`)
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case2 全部删除通过')
}

async function cleanupFlow(gtd: Gtd, state: CleanupState): Promise<void> {
  const { token } = gtd
  for (const tagId of state.tagIds) {
    const response = await e2eRequest(
      token,
      `/tags/${tagId}/delete`,
      jsonBody({ mode: 'untag' }),
    )
    if (response.status !== 200 && response.status !== 404)
      console.warn(`[e2e/tags] cleanup tag ${tagId} → ${response.status}`)
  }
  for (const docId of state.docIds) {
    const response = await e2eRequest(token, `/kb/documents/${docId}/delete`, jsonBody({}))
    if (response.status !== 200 && response.status !== 404)
      console.warn(`[e2e/tags] cleanup doc ${docId} → ${response.status}`)
  }

  try {
    const rows = await gtdRows(gtd)
    const now = new Date().toISOString()
    const ops = [...state.taskIds].flatMap((taskId): Op[] => {
      const status = taskStatus(rows, taskId)
      if (status === undefined)
        return []
      const purge: Op = { kind: 'purge', taskId }
      if (status === EXPLICIT_STATUS.DELETED)
        return [purge]
      return [{ kind: 'transition', id: randomUUID(), clientTs: now, action: 'delete', taskId }, purge]
    })
    if (ops.length)
      await actGtd(gtd, ops)
  }
  catch (error) {
    console.warn('[e2e/tags] cleanup GTD 失败:', error)
  }
}

/**
 * 真实 HTTP 全流程：
 * 建 tag + KB 文档 + GTD task/task_tag，再覆盖 untag、部分删与全删。
 * 删除标签目录后 task_tag 行仍在，设备按标签目录读时隐藏；删除关联任务 = 服务器把任务移进回收站。
 */
export async function runTagsE2E(): Promise<void> {
  const token = await signInE2E()
  const gtd: Gtd = { token, device: new GtdDevice(token) }
  const cleanup: CleanupState = {
    tagIds: new Set(),
    docIds: new Set(),
    taskIds: new Set(),
  }

  try {
    const mountDirId = await ensureKbMount(token)
    await caseUntag(gtd, cleanup, mountDirId)
    await casePartialDelete(gtd, cleanup, mountDirId)
    await caseFullDelete(gtd, cleanup, mountDirId)
    console.log('\n[e2e/tags] 完整 HTTP 流程通过 ✓')
  }
  finally {
    await cleanupFlow(gtd, cleanup)
  }
}
