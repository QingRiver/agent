interface ObsidianSearchMatch {
  match: string
  offset: number
}

export interface ObsidianSearchResult {
  score: number
  vault: string
  path: string
  basename: string
  foundWords: string[]
  matches: ObsidianSearchMatch[]
  excerpt: string
}

export type ObsidianSearchResponse = ObsidianSearchResult[]

function obsidianRestBaseUrl(): string {
  return 'http://localhost:51361'
}

/** 调用本地 Obsidian REST API：GET /search?q=... */
async function searchNotes(query: string): Promise<ObsidianSearchResponse> {
  const url = `${obsidianRestBaseUrl()}/search?q=${encodeURIComponent(query)}`
  const response = await fetch(url)
  return await response.json() as ObsidianSearchResponse
}

export const obsidian = {
  searchNotes,
}
