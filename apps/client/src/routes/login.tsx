import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useAuth } from '../hooks/useAuth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await signIn(email, password)
      await navigate({ to: '/' })
    }
    catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    }
    finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>登录</CardTitle>
          <CardDescription>登录后使用 SQLite 持久化检查点</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            {error != null && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? '登录中…' : '登录'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            还没有账号？
            {' '}
            <Link to="/register" className="text-primary hover:underline">
              注册
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
