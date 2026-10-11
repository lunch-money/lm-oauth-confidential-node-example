import { serve } from '@hono/node-server'
import type { Hono } from 'hono'

/** Starts the Node HTTP server that makes the OAuth example runnable in a browser. */
export function startServer(app: Hono, port: number): void {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(
      `Lunch Money OAuth example listening on http://localhost:${info.port}`,
    )
  })
}
