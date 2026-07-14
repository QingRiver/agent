import { RequireAuth } from '@components/auth/RequireAuth'
import { UserAvatarMenu } from '@components/auth/UserAvatarMenu'
import { ConversationSync } from '@components/conversation/ConversationSync'
import { CopilotKitAppProvider } from '@components/copilot/CopilotKitAppProvider'
import { AuthProvider } from '@contexts/AuthContext'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <AuthProvider>
      <CopilotKitAppProvider>
        <ConversationSync />
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b border-border px-6 py-4">
            <nav className="mx-auto flex max-w-4xl items-center gap-4">
              <Link
                to="/"
                className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
              >
                Chat
              </Link>
              <Link
                to="/text-editor"
                className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
              >
                编辑器
              </Link>
              <Link
                to="/kb"
                className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
              >
                知识库
              </Link>
              <div className="ml-auto">
                <UserAvatarMenu />
              </div>
            </nav>
          </header>
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        </div>
      </CopilotKitAppProvider>
    </AuthProvider>
  )
}
