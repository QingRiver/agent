import type { AppEnv } from '../types'
import { Hono } from 'hono'
import { simpleGraph, simpleGraphSse, weather } from '../handlers/sample'

export const sampleRoutes = new Hono<AppEnv>()
  .get('/simpleGraph', simpleGraph)
  .get('/simpleGraph/sse', simpleGraphSse)
  .get('/weather', weather)
