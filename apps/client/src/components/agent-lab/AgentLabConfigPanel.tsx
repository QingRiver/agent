import type { ReactAgentLabConfig } from './agentLabConfig'
import {
  composeReactAgentSystemPrompt,
  KB_SEARCH_SYSTEM_PROMPT,
  REACT_AGENT_MAX_STEPS_MAX,
  REACT_AGENT_MAX_STEPS_MIN,
} from '@agent/graph/react-agent-prompts'
import { ASK_TOOLS_SYSTEM_PROMPT } from '@agent/protocol'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { useMemo, useState } from 'react'
import { KbMarkdownEditor } from '../kb/KbMarkdownEditor'
import {
  DEFAULT_REACT_AGENT_LAB_CONFIG,
  resetAgentLabConfig,
  saveAgentLabConfig,
} from './agentLabConfig'

interface AgentLabConfigPanelProps {
  config: ReactAgentLabConfig
  onChange: (config: ReactAgentLabConfig) => void
  onNewThread: () => void
  creatingThread?: boolean
}

export function AgentLabConfigPanel({
  config,
  onChange,
  onNewThread,
  creatingThread = false,
}: AgentLabConfigPanelProps) {
  const [platformOpen, setPlatformOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [savedHint, setSavedHint] = useState<string | null>(null)

  const finalSystem = useMemo(
    () => composeReactAgentSystemPrompt(config.userPrompt),
    [config.userPrompt],
  )

  function patch(partial: Partial<ReactAgentLabConfig>) {
    onChange({ ...config, ...partial })
    setSavedHint(null)
  }

  function handleSave() {
    const saved = saveAgentLabConfig(config)
    onChange(saved)
    setSavedHint('已保存到本地')
  }

  function handleReset() {
    const next = resetAgentLabConfig()
    onChange(next)
    setEditorKey(k => k + 1)
    setSavedHint('已恢复默认并保存')
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Agent 配置</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          配置存 localStorage；改 prompt 后下一句对话即生效（无需先保存）
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lab-name">名称</Label>
        <Input
          id="lab-name"
          value={config.name}
          onChange={e => patch({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lab-desc">描述</Label>
        <Input
          id="lab-desc"
          value={config.description}
          onChange={e => patch({ description: e.target.value })}
        />
      </div>

      <div className="rounded-lg border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          onClick={() => setPlatformOpen(o => !o)}
        >
          平台系统提示词（只读）
          <span className="text-xs text-muted-foreground">{platformOpen ? '收起' : '展开'}</span>
        </button>
        {platformOpen && (
          <pre className="max-h-48 overflow-auto border-t border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {`${ASK_TOOLS_SYSTEM_PROMPT}\n\n---\n\n${KB_SEARCH_SYSTEM_PROMPT}`}
          </pre>
        )}
      </div>

      <div className="flex min-h-[12rem] flex-1 flex-col space-y-1.5">
        <Label>用户提示词（Markdown）</Label>
        <div className="min-h-[10rem] flex-1 overflow-hidden rounded-md border border-border">
          <KbMarkdownEditor
            key={`prompt-${editorKey}`}
            docId={`lab-prompt-${editorKey}`}
            value={config.userPrompt || DEFAULT_REACT_AGENT_LAB_CONFIG.userPrompt}
            onChange={value => patch({ userPrompt: value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lab-kb">kbId</Label>
          <Input
            id="lab-kb"
            value={config.kbId}
            onChange={e => patch({ kbId: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lab-steps">
            最大图步数 (
            {REACT_AGENT_MAX_STEPS_MIN}
            –
            {REACT_AGENT_MAX_STEPS_MAX}
            )
          </Label>
          <Input
            id="lab-steps"
            type="number"
            min={REACT_AGENT_MAX_STEPS_MIN}
            max={REACT_AGENT_MAX_STEPS_MAX}
            value={config.maxSteps}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isFinite(n))
                return
              patch({ maxSteps: n })
            }}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        平台工具（不可移除）：ask_input / ask_choice / ask_multi_choice / ask_confirm / kb_search
      </p>

      <div className="rounded-lg border border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          onClick={() => setPreviewOpen(o => !o)}
        >
          最终 system 预览
          <span className="text-xs text-muted-foreground">{previewOpen ? '收起' : '展开'}</span>
        </button>
        {previewOpen && (
          <pre className="max-h-56 overflow-auto border-t border-border bg-muted/40 p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {finalSystem}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleSave}>保存到本地</Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReset}>恢复默认</Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={creatingThread}
          onClick={onNewThread}
        >
          {creatingThread ? '创建中…' : '新开测试线程'}
        </Button>
      </div>
      {savedHint != null && (
        <p className="text-xs text-muted-foreground">{savedHint}</p>
      )}
    </div>
  )
}
