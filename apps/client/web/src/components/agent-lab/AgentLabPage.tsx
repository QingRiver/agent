import type { ReactAgentLabConfig } from './agentLabConfig'
import { AgentConfigApi } from '@apis/agent-config-api'
import { Conversation } from '@apis/conversation-api'
import { CopilotChatShell } from '@components/copilot/CopilotChatShell'
import { ReactAgentRuntimeStore } from '@stores/react-agent-runtime-store'
import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_REACT_AGENT_LAB_CONFIG,
  labConfigFromRemote,
  loadStoredAgentConfigId,
  saveStoredAgentConfigId,
} from './agentLabConfig'
import { AgentLabConfigPanel } from './AgentLabConfigPanel'

type ThreadCreationResult
  = | { ok: true, threadId: string }
    | { ok: false, error: string }

async function createAgentLabThread(): Promise<ThreadCreationResult> {
  try {
    const conversation = await Conversation.create('reactAgent')
    return { ok: true, threadId: conversation.id }
  }
  catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '创建测试线程失败',
    }
  }
}

async function loadLabConfigFromServer(): Promise<ReactAgentLabConfig> {
  const id = loadStoredAgentConfigId()
  if (!id)
    return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }

  try {
    const remote = await AgentConfigApi.get(id)
    return labConfigFromRemote(remote)
  }
  catch {
    saveStoredAgentConfigId(null)
    return { ...DEFAULT_REACT_AGENT_LAB_CONFIG }
  }
}

function AgentLabChatPanel({
  threadId,
  config,
}: {
  threadId: string
  config: ReactAgentLabConfig
}) {
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-2 shrink-0">
        <h2 className="text-base font-semibold text-foreground">
          {config.name || 'reactAgent'}
        </h2>
        <p className="text-xs text-muted-foreground">
          {config.description || '通用 ReAct 试验台'}
          {' · '}
          thread
          {' '}
          {threadId.slice(0, 8)}
          …
          {config.agentConfigId
            ? ` · config ${config.agentConfigId.slice(0, 8)}…`
            : ' · 同步配置中…'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <CopilotChatShell
          agentId="reactAgent"
          threadId={threadId}
          hitl
        />
      </div>
    </div>
  )
}

export function AgentLabPage() {
  const [config, setConfig] = useState<ReactAgentLabConfig | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setCreating(true)
      setError(null)
      const [labConfig, threadResult] = await Promise.all([
        loadLabConfigFromServer(),
        createAgentLabThread(),
      ])
      if (cancelled)
        return
      configIdRef.current = labConfig.agentConfigId
      setConfig(labConfig)
      if (labConfig.agentConfigId)
        ReactAgentRuntimeStore.setAgentConfigId(labConfig.agentConfigId)
      if (!threadResult.ok)
        setError(threadResult.error)
      else
        setThreadId(threadResult.threadId)
      setCreating(false)
    }

    void bootstrap()
    return () => {
      cancelled = true
      ReactAgentRuntimeStore.setAgentConfigId(null)
    }
  }, [])

  // 表单变更 → upsert。skillCodes 立即写库，避免勾选后立刻对话仍 SKILL_NOT_BOUND
  const name = config?.name
  const description = config?.description
  const userPrompt = config?.userPrompt
  const kbId = config?.kbId
  const maxSteps = config?.maxSteps
  const skillCodes = config?.skillCodes
  const prevSkillCodesRef = useRef<string[] | undefined>(undefined)

  useEffect(() => {
    if (
      name === undefined
      || description === undefined
      || userPrompt === undefined
      || kbId === undefined
      || maxSteps === undefined
      || skillCodes === undefined
    ) {
      return
    }
    const skillsChanged = JSON.stringify(prevSkillCodesRef.current) !== JSON.stringify(skillCodes)
    prevSkillCodesRef.current = skillCodes
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const existingId = configIdRef.current
        const payload = {
          ...(existingId ? { id: existingId } : {}),
          name,
          description,
          userPrompt,
          kbId,
          maxSteps,
          skillCodes,
        }
        try {
          const saved = await AgentConfigApi.upsert(payload)
          if (cancelled)
            return
          configIdRef.current = saved.id
          saveStoredAgentConfigId(saved.id)
          ReactAgentRuntimeStore.setAgentConfigId(saved.id)
          setConfig((prev) => {
            if (prev == null)
              return prev
            if (prev.agentConfigId === saved.id)
              return prev
            return { ...prev, agentConfigId: saved.id }
          })
        }
        catch (err) {
          console.error('[AgentLabPage] upsert failed', err)
        }
      })()
    }, skillsChanged ? 0 : 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [name, description, userPrompt, kbId, maxSteps, skillCodes])

  async function createThread() {
    setCreating(true)
    setError(null)
    const result = await createAgentLabThread()
    if (!result.ok)
      setError(result.error)
    else
      setThreadId(result.threadId)
    setCreating(false)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl gap-0 border-x border-border">
      <aside className="w-full max-w-md shrink-0 border-r border-border bg-card">
        {config == null
          ? (
              <p className="p-4 text-sm text-muted-foreground">加载配置…</p>
            )
          : (
              <AgentLabConfigPanel
                config={config}
                onChange={setConfig}
                onNewThread={() => void createThread()}
                creatingThread={creating}
              />
            )}
      </aside>
      <main className="min-w-0 flex-1 bg-muted/30">
        {error != null && (
          <p className="p-4 text-sm text-destructive">{error}</p>
        )}
        {(threadId == null || config == null) && error == null && (
          <p className="p-4 text-sm text-muted-foreground">正在准备试验台…</p>
        )}
        {threadId != null && config != null && (
          <AgentLabChatPanel
            key={threadId}
            threadId={threadId}
            config={config}
          />
        )}
      </main>
    </div>
  )
}
