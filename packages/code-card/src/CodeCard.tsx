import type { ReactNode } from 'react'
import type { CardContextValue } from './card-context'
import type { CardScope } from './compile'
import React, { Component, useMemo } from 'react'
import { CardContext } from './card-context'
import { evaluateCard } from './compile'
import { useCardContext } from './use-card-context'

export interface CodeCardProps<T> {
  code: string
  info: T
  isLoading?: boolean
  error?: Error
  onAction?: (actionName: string, payload?: unknown) => void
}

function CardError({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      渲染失败：
      {message}
    </div>
  )
}

interface BoundaryState {
  error: Error | null
}

class CardErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  render() {
    if (this.state.error)
      return <CardError message={this.state.error.message} />
    return this.props.children
  }
}

export function CodeCard<T>({
  code,
  info,
  isLoading = false,
  error,
  onAction,
}: CodeCardProps<T>) {
  // 生成组件在函数顶层调用这两个 hook；编译器看不到 new Function 里的调用
  const scope = useMemo<CardScope>(() => ({
    React,
    // eslint-disable-next-line react-compiler/react-compiler -- 交给生成组件在顶层调用
    useState: React.useState,
    // eslint-disable-next-line react-compiler/react-compiler -- 交给生成组件在顶层调用
    useCardContext,
  }), [])

  const compiled = useMemo(() => {
    try {
      return { component: evaluateCard(code, scope), error: null }
    }
    catch (err) {
      const compileError = err instanceof Error ? err : new Error(String(err))
      return { component: null, error: compileError }
    }
  }, [code, scope])

  const value = useMemo((): CardContextValue<T> => ({
    info,
    isLoading,
    triggerAction: (actionName: string, payload?: unknown) => {
      onAction?.(actionName, payload)
    },
    ...(error ? { error } : {}),
  }), [info, isLoading, error, onAction])

  if (compiled.error)
    return <CardError message={compiled.error.message} />

  const View = compiled.component
  if (!View)
    return <CardError message="没有可渲染的组件" />

  return (
    <CardContext value={value as CardContextValue<unknown>}>
      <CardErrorBoundary key={code}>
        <View />
      </CardErrorBoundary>
    </CardContext>
  )
}
