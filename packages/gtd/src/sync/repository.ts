import type {
  Perspective,
  RepeatRule,
  Tag,
  Task,
} from '../data/schema'

/**
 * GTD 持久化 Port（接口）。
 *
 * 领域层定义"需要持久化什么"，server 侧（apps/server/src/gtd/repository.ts）
 * 提供 drizzle adapter 实现本接口。本接口不依赖任何 DB 驱动，保持 gtd 包纯净。
 *
 * folder/project 退出 sync（统一 dirs 树在线 API）。task 经 mount_dir_id
 * 挂载到 dirs，project_id 由 sync-repository 落库 stamp 派生（非本接口职责）。
 *
 * 细粒度 saveX/deleteX 服务高频单实体写（diff 写，减少写放大）。
 */
export interface GtdRepository {
  getTask: (userId: string, taskId: string) => Promise<Task | null>
  /**
   * upsert task 行；repeatRule 内联到 task 行 repeat_rule jsonb（DB 无独立 repeat_rules 表）。
   * task.repeatRuleId 非空时 repeatRule 须为对应 rule，null 时清空。
   */
  saveTask: (userId: string, task: Task, repeatRule: RepeatRule | null) => Promise<void>
  deleteTask: (userId: string, taskId: string) => Promise<void>

  saveTag: (userId: string, tag: Tag) => Promise<void>
  deleteTag: (userId: string, tagId: string) => Promise<void>

  savePerspective: (userId: string, perspective: Perspective) => Promise<void>
  deletePerspective: (userId: string, perspectiveId: string) => Promise<void>
}
