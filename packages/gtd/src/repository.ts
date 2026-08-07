import type {
  GtdDocument,
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from './schema'

/**
 * GTD 持久化 Port（接口）。
 *
 * 领域层定义"需要持久化什么"，server 侧（apps/server/src/gtd/repository.ts）
 * 提供 drizzle adapter 实现本接口。本接口不依赖任何 DB 驱动，保持 gtd 包纯净。
 *
 * Phase 1：folder/project 退出 sync（统一 dirs 树在线 API），doc.folders/projects 恒空；
 * 故移除 getProject/saveProject/deleteProject/saveFolder/deleteFolder。task 经 mount_dir_id
 * 挂载到 dirs，project_id 由 sync-repository 落库 stamp 派生（非本接口职责）。
 *
 * 粗粒度 loadDocument/saveDocument 服务导入导出与全量装配；
 * 细粒度 saveX/deleteX 服务高频单实体写（diff 写，减少写放大）。
 */
export interface GtdRepository {
  /** 装配用户完整 GtdDocument（folders/projects 恒空 + tags/tasks/perspectives/...） */
  loadDocument: (userId: string) => Promise<GtdDocument>
  /** 全量 upsert（导入用，低频；事务内重写各表） */
  saveDocument: (userId: string, doc: GtdDocument) => Promise<void>

  getTask: (userId: string, taskId: string) => Promise<Task | null>
  /**
   * upsert task 行；repeatRule 内联到 task 行 repeat_rule jsonb（DB 无独立 repeat_rules 表）。
   * task.repeatRuleId 非空时 repeatRule 须为对应 rule（service 从 doc.repeatRules 取），null 时清空。
   */
  saveTask: (userId: string, task: Task, repeatRule: RepeatRule | null) => Promise<void>
  deleteTask: (userId: string, taskId: string) => Promise<void>

  saveTag: (userId: string, tag: Tag) => Promise<void>
  deleteTag: (userId: string, tagId: string) => Promise<void>

  savePerspective: (userId: string, perspective: Perspective) => Promise<void>
  deletePerspective: (userId: string, perspectiveId: string) => Promise<void>
}
