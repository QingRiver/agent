import { createRouter, RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { CopilotKitAppProvider } from './components/copilot/CopilotKitAppProvider'
import { AuthProvider } from './contexts/AuthContext'
import { ConversationsProvider } from './contexts/ConversationsContext'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <CopilotKitAppProvider>
      <ConversationsProvider>
        <RouterProvider router={router} />
      </ConversationsProvider>
    </CopilotKitAppProvider>
  </AuthProvider>,
)
