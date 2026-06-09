export interface AuthUser {
  id: string
  email: string
  name: string
  image?: string | null
}

export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isGuest: boolean
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
}
