import { createAuthClient } from 'better-auth/react'

const TOKEN_KEY = 'bearer_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token)
    localStorage.setItem(TOKEN_KEY, token)
  else
    localStorage.removeItem(TOKEN_KEY)
}

export const authClient = createAuthClient({
  // 省略 baseURL：浏览器下自动用 window.location.origin + /api/auth（须为完整 URL，不能写相对路径）
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => getStoredToken() ?? '',
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token')
      if (token)
        setStoredToken(token)
    },
  },
})
