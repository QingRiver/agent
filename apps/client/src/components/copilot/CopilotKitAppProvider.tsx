import type { ReactNode } from 'react'
import { CopilotKitProvider } from '@copilotkit/react-core/v2'
import { useAuth } from '@hooks/useAuth'
import '@copilotkit/react-core/v2/styles.css'

interface CopilotKitAppProviderProps {
  children: ReactNode
}

export function CopilotKitAppProvider({ children }: CopilotKitAppProviderProps) {
  const { token } = useAuth()

  if (!token)
    return <>{children}</>

  return (
    <CopilotKitProvider
      key={token}
      runtimeUrl="/api/copilotkit"
      headers={{ Authorization: `Bearer ${token}` }}
    >
      {children}
    </CopilotKitProvider>
  )
}
