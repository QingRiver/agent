import { LogOut } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

function displayInitial(user: { name?: string, email?: string }): string {
  const source = user.name?.trim() || user.email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

export function UserAvatarMenu() {
  const { user, isLoading, signOut } = useAuth()

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
            <AvatarFallback className="bg-emerald-900 text-emerald-100">
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
