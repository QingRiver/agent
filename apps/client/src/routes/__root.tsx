import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <nav className="mx-auto flex max-w-4xl items-center gap-4">
          <Link
            to="/"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            Home
          </Link>
          <Link
            to="/sse"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            SSE
          </Link>
          <Link
            to="/agui"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            AG-UI
          </Link>
          <Link
            to="/weather/sse"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            Weather SSE
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
