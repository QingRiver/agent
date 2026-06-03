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
            to="/simple"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            Simple
          </Link>
          <Link
            to="/weather"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            Weather
          </Link>
          <Link
            to="/weather/sse"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            Weather SSE
          </Link>
          <Link
            to="/hitl"
            className="text-sm font-medium text-slate-300 hover:text-white [&.active]:text-emerald-400"
          >
            人在回路
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  )
}
