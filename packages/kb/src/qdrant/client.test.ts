import { describe, expect, it } from 'vitest'
import { buildUpsertPoint } from './client'
import { DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME } from './collection'

const chunk = {
  chunk_id: 'c1',
  source_doc_id: 'd1',
  heading_path: ['H1', 'H2'],
  raw_text: 'hello world',
}

const baseInput = {
  pointId: 'c1',
  chunk,
  docId: 'd1',
  denseVector: [0.1, 0.2],
}

describe('buildUpsertPoint payload（认 id，无 vdir）', () => {
  it('含 mount_dir_id / project_id / owner / tag_ids（当提供）', () => {
    const point = buildUpsertPoint({
      ...baseInput,
      mountDirId: 'dir-1',
      projectId: 'proj-1',
      owner: 'u1',
      tagIds: ['t1', 't2'],
    })
    const payload = point.payload as Record<string, unknown>
    expect(payload.source_doc_id).toBe('d1')
    expect(payload.doc_id).toBe('d1')
    expect(payload.chunk_id).toBe('c1')
    expect(payload.mount_dir_id).toBe('dir-1')
    expect(payload.project_id).toBe('proj-1')
    expect(payload.owner).toBe('u1')
    expect(payload.tag_ids).toEqual(['t1', 't2'])
  })

  it('不携带 vdir（已从 payload 移除）', () => {
    const point = buildUpsertPoint({ ...baseInput, mountDirId: 'dir-1', projectId: 'proj-1' })
    const payload = point.payload as Record<string, unknown>
    expect('vdir' in payload).toBe(false)
  })

  it('mount_dir_id / project_id 未提供时不写入 payload（条件展开）', () => {
    const point = buildUpsertPoint(baseInput)
    const payload = point.payload as Record<string, unknown>
    expect('mount_dir_id' in payload).toBe(false)
    expect('project_id' in payload).toBe(false)
    expect('owner' in payload).toBe(false)
    expect('tag_ids' in payload).toBe(false)
  })

  it('vector 名为 dense/sparse 常量', () => {
    const point = buildUpsertPoint(baseInput)
    const vector = point.vector as Record<string, unknown>
    expect(vector[DENSE_VECTOR_NAME]).toEqual([0.1, 0.2])
    const sparse = vector[SPARSE_VECTOR_NAME] as { text: string, model: string }
    expect(sparse.text).toBe('hello world')
    expect(sparse.model).toBe('qdrant/bm25')
  })
})
