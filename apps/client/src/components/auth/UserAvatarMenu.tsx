import { Avatar, AvatarFallback } from '@components/ui/avatar'
import { Button } from '@components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { useAuth } from '@hooks/useAuth'
import { ThemeStore } from '@stores/theme-store'
import { Link } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { LogOut, Moon, Palette, Sun } from 'lucide-react'

function displayInitial(user: { name?: string, email?: string }): string {
  const source = user.name?.trim() || user.email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

export function UserAvatarMenu() {
  const { user, isLoading, signOut } = useAuth()
  const mode = useAtomValue(ThemeStore.modeAtom)
  const isDark = mode === 'dark'

  if (isLoading || !user) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary text-primary-foreground">
              {displayInitial(user)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span>{user.name || user.email}</span>
            <span className="text-xs font-normal text-muted-foreground">
              SQLite 检查点
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings/theme" className="flex cursor-pointer items-center gap-2">
            <Palette className="h-4 w-4" />
            主题色
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2"
          onSelect={(e) => {
            e.preventDefault()
            ThemeStore.toggleMode()
          }}
        >
          {isDark
            ? <Sun className="h-4 w-4" />
            : <Moon className="h-4 w-4" />}
          {isDark ? '切换亮色' : '切换暗色'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
          onSelect={() => { void signOut() }}
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
