declare global {
  type ValuesOf<T> = T[keyof T]
}

export {}
