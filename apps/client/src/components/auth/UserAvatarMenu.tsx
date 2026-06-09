import { Link } from '@tanstack/react-router'
import { LogIn, LogOut, UserRound } from 'lucide-react'
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

function displayInitial(user: { name?: string, email?: string } | null): string {
  if (!user)
    return '游'
  const source = user.name?.trim() || user.email?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

export function UserAvatarMenu() {
  const { user, isGuest, isLoading, signOut } = useAuth()

  if (isLoading) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-9 rounded-full p-0">
          <Avatar className="h-9 w-9">
            <AvatarFallback className={isGuest ? 'bg-slate-700 text-slate-200' : 'bg-emerald-900 text-emerald-100'}>
              {isGuest ? <UserRound className="h-4 w-4" /> : displayInitial(user)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span>{isGuest ? '游客' : (user?.name || user?.email)}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {isGuest ? '内存检查点' : 'SQLite 检查点'}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isGuest
          ? (
              <DropdownMenuItem asChild>
                <Link to="/login" className="flex cursor-pointer items-center gap-2">
                  <LogIn className="h-4 w-4" />
                  登录
                </Link>
              </DropdownMenuItem>
            )
          : (
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2 text-destructive focus:text-destructive"
                onSelect={() => { void signOut() }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
