import { useEffect, useRef } from 'react'

/**
 * 在 Effect 阶段同步最新值到 ref，供事件回调 / 非响应式闭包读取。
 * 避免 render 写 ref（React Compiler 会拒绝），也避免把 value 放进 Effect 依赖导致重订阅。
 *
 * 注意：ref 在 paint 后才更新；同一次渲染内的同步调用可能仍读到旧值。
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref
}
