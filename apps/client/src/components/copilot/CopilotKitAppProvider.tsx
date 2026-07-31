import type { ReactNode } from 'react'
import { CopilotKitProvider } from '@copilotkit/react-core/v2'
import { useAuth } from '@hooks/useAuth'
import { ReactAgentRuntimeStore } from '@stores/react-agent-runtime-store'
import { useAtomValue } from 'jotai'

interface CopilotKitAppProviderProps {
  children: ReactNode
}

export function CopilotKitAppProvider({ children }: CopilotKitAppProviderProps) {
  const { token } = useAuth()
  const properties = useAtomValue(ReactAgentRuntimeStore.propertiesAtom)

  if (!token)
    return <>{children}</>

  return (
    <CopilotKitProvider
      key={token}
      runtimeUrl="/api/copilotkit"
      headers={{ Authorization: `Bearer ${token}` }}
      properties={properties}
    >
      {children}
    </CopilotKitProvider>
  )
}
