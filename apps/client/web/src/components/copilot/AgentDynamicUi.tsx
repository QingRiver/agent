import type { WeatherCurrentProps } from '@agent/ui'
import type { GraphsName } from '@apis/api-types'
import {
  WEATHER_CURRENT_TOOL_NAME,
  WeatherCurrentCard,
  WeatherCurrentPropsSchema,
} from '@agent/ui'
import { useComponent, useRenderTool } from '@copilotkit/react-core/v2'

/**
 * 非中断 Generative UI Host。
 *
 * - `useComponent`：与方案文档同形（name + Zod + View）；本仓无 copilotkit.actions 桥时
 *   主要作前端工具注册 / 历史回放渲染。
 * - `useRenderTool`：画 graph 侧同名后端工具的 TOOL_CALL（dev 天气分支实际路径）。
 *
 * ask_human 仍走 HITL interrupt，不在此注册。
 */
export function AgentDynamicUi({ agentId }: { agentId: GraphsName }) {
  useComponent(
    {
      name: WEATHER_CURRENT_TOOL_NAME,
      description: '展示当前天气卡片。参数须来自 get_weather 成功返回的 weather 字段。',
      parameters: WeatherCurrentPropsSchema,
      render: WeatherCurrentRender,
      agentId,
      followUp: false,
    },
    [agentId],
  )

  useRenderTool(
    {
      name: WEATHER_CURRENT_TOOL_NAME,
      parameters: WeatherCurrentPropsSchema,
      render: ({ parameters, status }) => {
        if (status === 'inProgress' || status === 'executing') {
          return (
            <div className="h-28 max-w-sm animate-pulse rounded-lg border border-border bg-muted" />
          )
        }
        return <WeatherCurrentRender {...parameters} />
      },
    },
    [agentId],
  )

  return null
}

function WeatherCurrentRender(props: WeatherCurrentProps) {
  if (props.city == null || props.city === '' || props.temperatureC == null || props.condition == null) {
    return (
      <div className="h-28 max-w-sm animate-pulse rounded-lg border border-border bg-muted" />
    )
  }
  return <WeatherCurrentCard {...props} />
}
