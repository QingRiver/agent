import { Annotation } from '@langchain/langgraph'

/** 覆盖写字段：后写覆盖前写 */
export function lastValue<T>(defaultValue: () => T) {
  return Annotation<T>({
    reducer: (_prev, next) => next,
    default: defaultValue,
  })
}
