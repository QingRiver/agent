import type { GtdMutation, PullResponse, PushResponse } from '@agent/gtd'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { e2eFetch, e2eRequest, signInE2E } from '../client'
import { assert } from '../support'

const KB_ID = process.env.KB_ID ?? 'kb_default'

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
  taskTagIds: string[]
}

interface CleanupState {
  tagIds: Set<string>
  docIds: Set<string>
  taskIds: Set<string>
  taskTagIds: Set<string>
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(value),
  }
}

function mutationId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function taskPatch(name: string, now: string) {
  return {
    name,
    note: null,
    projectId: null,
    parentId: null,
    order: 0,
    status: 'active' as const,
    groupType: null,
    deferDate: null,
    dueDate: null,
    completedAt: null,
    droppedAt: null,
    flagged: false,
    estimateMinutes: null,
    repeatRuleId: null,
    repeatedFromTaskId: null,
    createdAt: now,
    updatedAt: now,
    repeatRule: null,
  }
}

async function pushMutations(token: string, mutations: GtdMutation[]): Promise<PushResponse> {
  const response = await e2eFetch<PushResponse>(
    token,
    '/gtd/sync/push',
    jsonBody({ mutations, commands: [], lastSyncId: 0 }),
  )
  assert(response.rejected.length === 0, `GTD push 被拒绝: ${JSON.stringify(response.rejected)}`)
  assert(
    response.applied.length === mutations.length,
    `GTD push applied=${response.applied.length}，期望 ${mutations.length}`,
  )
  return response
}

async function pullAll(token: string): Promise<PullResponse> {
  return e2eFetch<PullResponse>(token, '/gtd/sync/pull', jsonBody({ lastSyncId: 0 }))
}

async function createScenario(
  token: string,
  cleanup: CleanupState,
  suffix: string,
): Promise<Scenario> {
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
        kbId: KB_ID,
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
  const taskTagIds = taskIds.map(taskId => `${taskId}|${tag.id}`)
  const mutations: GtdMutation[] = []
  for (const [index, taskId] of taskIds.entries()) {
    mutations.push({
      id: mutationId('task'),
      entity: 'task',
      entityId: taskId,
      op: 'upsert',
      clientTs: now,
      patch: taskPatch(`e2e-${suffix}-task-${index + 1}`, now),
    })
    mutations.push({
      id: mutationId('task-tag'),
      entity: 'task_tag',
      entityId: taskTagIds[index]!,
      op: 'upsert',
      clientTs: now,
      patch: { taskId, tagId: tag.id },
    })
    cleanup.taskIds.add(taskId)
    cleanup.taskTagIds.add(taskTagIds[index]!)
  }
  await pushMutations(token, mutations)

  // 从真实读接口确认两域关联均已落地。
  for (const doc of docs) {
    const actual = (await e2eFetch<{ doc: KbDoc }>(
      token,
      `/kb/documents/${doc.id}/get`,
      jsonBody({}),
    )).doc
    assert(actual.tagIds.includes(tag.id), `文档 ${doc.id} 未关联 tag ${tag.id}`)
  }
  const pull = await pullAll(token)
  for (const taskId of taskIds) {
    const task = pull.changes.find(c => c.entity === 'task' && c.id === taskId)
    assert(task && !task.deleted, `GTD task ${taskId} 未创建`)
  }
  for (const taskTagId of taskTagIds) {
    const taskTag = pull.changes.find(c => c.entity === 'task_tag' && c.id === taskTagId)
    assert(taskTag && !taskTag.deleted, `GTD task_tag ${taskTagId} 未创建`)
  }

  return { tag, docs, taskIds, taskTagIds }
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

async function caseUntag(token: string, cleanup: CleanupState): Promise<void> {
  const scenario = await createScenario(token, cleanup, 'untag')
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

  const pull = await pullAll(token)
  for (const taskId of scenario.taskIds) {
    const task = pull.changes.find(c => c.entity === 'task' && c.id === taskId)
    assert(task && !task.deleted, `untag 错删 GTD task ${taskId}`)
  }
  for (const taskTagId of scenario.taskTagIds) {
    const link = pull.changes.find(c => c.entity === 'task_tag' && c.id === taskTagId)
    assert(link?.deleted, `untag 后 task_tag ${taskTagId} 未删除`)
  }
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case1 untag 通过')
}

async function casePartialDelete(token: string, cleanup: CleanupState): Promise<void> {
  const scenario = await createScenario(token, cleanup, 'partial')
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

  const pull = await pullAll(token)
  const deletedTask = pull.changes.find(c => c.entity === 'task' && c.id === deletedTaskId)
  const keptTask = pull.changes.find(c => c.entity === 'task' && c.id === keptTaskId)
  assert(deletedTask?.deleted, `部分删除未删除 GTD task ${deletedTaskId}`)
  assert(keptTask && !keptTask.deleted, `部分删除误删 GTD task ${keptTaskId}`)
  for (const taskTagId of scenario.taskTagIds) {
    const link = pull.changes.find(c => c.entity === 'task_tag' && c.id === taskTagId)
    assert(link?.deleted, `部分删除后 task_tag ${taskTagId} 未清理`)
  }
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case2 部分删除通过')
}

async function caseFullDelete(token: string, cleanup: CleanupState): Promise<void> {
  const scenario = await createScenario(token, cleanup, 'full')
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
  const pull = await pullAll(token)
  for (const taskId of scenario.taskIds) {
    const task = pull.changes.find(c => c.entity === 'task' && c.id === taskId)
    assert(task?.deleted, `全部删除未删除 GTD task ${taskId}`)
  }
  await assertTagDeleted(token, scenario.tag.id)
  console.log('[e2e/tags] case2 全部删除通过')
}

async function cleanupFlow(token: string, state: CleanupState): Promise<void> {
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

  const now = new Date().toISOString()
  const mutations: GtdMutation[] = [
    ...[...state.taskTagIds].map((entityId): GtdMutation => ({
      id: mutationId('cleanup-task-tag'),
      entity: 'task_tag',
      entityId,
      op: 'delete',
      clientTs: now,
    })),
    ...[...state.taskIds].map((entityId): GtdMutation => ({
      id: mutationId('cleanup-task'),
      // 测试清理用 sync 软删(op:'delete' → row.deleted=true, status 不变),非 domain deleteTask command
      // (deleteTask 仅 ACTIVE 可删 SP-STATE-6,会拒 completed/hold;清理须删任意态 → 软删)
      entity: 'task',
      entityId,
      op: 'delete',
      clientTs: now,
    })),
  ]
  if (mutations.length) {
    try {
      await pushMutations(token, mutations)
    }
    catch (error) {
      console.warn('[e2e/tags] cleanup GTD 失败:', error)
    }
  }
}

/**
 * 真实 HTTP 全流程：
 * 建 tag + KB 文档 + GTD task/task_tag，再覆盖 untag、部分删与全删。
 */
export async function runTagsE2E(): Promise<void> {
  const token = await signInE2E()
  const cleanup: CleanupState = {
    tagIds: new Set(),
    docIds: new Set(),
    taskIds: new Set(),
    taskTagIds: new Set(),
  }

  try {
    await caseUntag(token, cleanup)
    await casePartialDelete(token, cleanup)
    await caseFullDelete(token, cleanup)
    console.log('\n[e2e/tags] 完整 HTTP 流程通过 ✓')
  }
  finally {
    await cleanupFlow(token, cleanup)
  }
}
