import type { Buffer } from 'node:buffer'

export type KbIndexingStatus = 'draft' | 'indexing' | 'completed' | 'error'

export interface KbDocSummary {
  id: string
  userId: string
  kbId: string
  /** 挂载 dirs.id（权威位置）；必须落在已初始化知识库子树内 */
  mountDirId: string
  /** 冗余缓存 = walkToProjectRoot(mountDirId) */
  projectId: string | null
  name: string
  filename: string | null
  /** 派生展示缓存 = dirVdir(mountDir.vdir, name)；folder 改名/移动后可能软过期，client 据 dir 树重派生 */
  vdir: string | null
  tagIds: string[]
  owner: string | null
  summary: string | null
  keywords: string[]
  toc: string[]
  visibility: string
  pinned: boolean
  indexingStatus: KbIndexingStatus
  error: string | null
  draftHash: string | null
  publishedHash: string | null
  createdAt: number
  updatedAt: number
  indexedAt: number | null
}

export interface KbDoc extends KbDocSummary {
  content: string
  permissions: Record<string, unknown>
}

export interface KbIngestFile {
  buffer: Buffer
  filename: string
}

export interface KbIngestResultItem {
  docId: string
  name: string
  mountDirId: string
  skipped: boolean
}

export interface KbBinding {
  dirId: string
  userId: string
  dirName: string
  vdir: string
}
