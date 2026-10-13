import { Alert, AlertTitle } from '@components/ui/alert'
import { cn } from '@lib/utils'
import { X } from 'lucide-react'

interface AgentErrorBannerProps {
  message: string
  onDismiss: () => void
  className?: string
}

export function AgentErrorBanner({ message, onDismiss, className }: AgentErrorBannerProps) {
  return (
    <Alert variant="destructive" className={cn('relative gap-1.5 py-2.5', className)}>
      <X
        className="absolute right-2 top-2 size-4 cursor-pointer opacity-50 hover:opacity-100"
        onClick={onDismiss}
      />
      <AlertTitle className="pr-6 text-destructive">{message}</AlertTitle>
    </Alert>
  )
}
