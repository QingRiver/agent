import type { ReactNode } from 'react'
import { getStoredToken } from '@apis/auth-client'
import { CopilotKitProvider } from '@copilotkit/react-core/v2'
import { useAuth } from '@hooks/useAuth'
import { ReactAgentRuntimeStore } from '@stores/react-agent-runtime-store'
import { useAtomValue } from 'jotai'

interface CopilotKitAppProviderProps {
  children: ReactNode
}

/**
 * 与 RequireAuth 对齐：authed = user || token 时必须挂 CopilotKitProvider，
 * 否则 Outlet 里的 CopilotChatShell / useAgent 会抛
 * 「useCopilotKit must be used within CopilotKitProvider」。
 * headers 优先 React token，回退 localStorage（onSuccess 只写 storage 时防短窗不同步）。
 */
export function CopilotKitAppProvider({ children }: CopilotKitAppProviderProps) {
  const { user, token } = useAuth()
  const properties = useAtomValue(ReactAgentRuntimeStore.propertiesAtom)
  const bearer = token ?? getStoredToken()
  const authed = user != null || bearer != null

  if (!authed)
    return <>{children}</>

  return (
    <CopilotKitProvider
      key={bearer ?? user?.id ?? 'authed'}
      runtimeUrl="/api/copilotkit"
      headers={bearer ? { Authorization: `Bearer ${bearer}` } : {}}
      properties={properties}
    >
      {children}
    </CopilotKitProvider>
  )
}
