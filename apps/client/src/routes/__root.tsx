import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { UserAvatarMenu } from '../components/auth/UserAvatarMenu'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <nav className="mx-auto flex max-w-4xl items-center gap-4">
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
          >
            Home
          </Link>
          <Link
            to="/sse"
            className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
          >
            SSE
          </Link>
          <Link
            to="/agui"
            className="text-sm font-medium text-muted-foreground hover:text-foreground [&.active]:text-primary"
          >
            AG-UI
          </Link>
          <div className="ml-auto">
            <UserAvatarMenu />
          </div>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
