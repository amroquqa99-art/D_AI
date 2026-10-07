/** SearXNG integration through the existing native web search provider API. */
import type { Context } from '@deepseek-ai/cordis'
import schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { WebError, type WebSearchProvider, type WebSearchSource } from '@deepseek-ai/dsh-web'

export const name = 'd-ai-web-searxng'
export const inject = ['web']

/** Fixed deployment-controlled endpoint; queries cannot choose an outbound host. */
export interface Config {
  baseURL: string
  timeoutMs: number
  maxResponseBytes: number
  maxResults: number
  maxQueryBytes: number
}

export const Config = schema.object({
  baseURL: schema.string().required(),
  timeoutMs: schema.number().step(1).min(1).max(2147483647).default(15000),
  maxResponseBytes: schema.number().step(1).min(1).default(524288),
  maxResults: schema.number().step(1).min(1).max(100).default(10),
  maxQueryBytes: schema.number().step(1).min(1).default(4096),
})

const responseSchema = z.object({
  results: z.array(z.object({ url: z.string(), title: z.string().optional(), content: z.string().optional() })),
})

/** Construct a bounded JSON API provider without owning or copying the search engine.
 * @param config - validated limits and deployment-owned SearXNG endpoint.
 * @returns native web provider with cancellation and explicit failure diagnostics.
 */
export function createSearxngProvider(config: Config): WebSearchProvider {
  const endpoint = new URL(config.baseURL)
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash) {
    throw new WebError('SearXNG baseURL must be HTTP(S) without credentials, query or fragment', 'D_AI_SEARCH_CONFIG')
  }
  if (!endpoint.pathname.endsWith('/')) endpoint.pathname += '/'
  const searchURL = new URL('search', endpoint)
  return {
    id: 'dai-searxng',
    available: () => true,
    async search(request, callerSignal) {
      callerSignal?.throwIfAborted()
      if (!request.query.trim() || Buffer.byteLength(request.query, 'utf8') > config.maxQueryBytes) {
        throw new WebError('Search query is empty or exceeds byte budget', 'D_AI_SEARCH_QUERY_LIMIT')
      }
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(config.timeoutMs)])
        : AbortSignal.timeout(config.timeoutMs)
      const url = new URL(searchURL)
      url.searchParams.set('q', request.query)
      url.searchParams.set('format', 'json')
      const response = await fetch(url, { signal, redirect: 'error', headers: { Accept: 'application/json' } })
      try {
        if (!response.ok) throw new WebError(
          'SearXNG HTTP ' + String(response.status) + '; enable JSON search format and check service configuration',
          'D_AI_SEARCH_HTTP',
        )
        if (!response.body) throw new WebError('SearXNG returned no response body', 'D_AI_SEARCH_RESPONSE')
        const reader = response.body.getReader()
        let bytes = 0
        const chunks: Uint8Array[] = []
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            bytes += value.byteLength
            if (bytes > config.maxResponseBytes) throw new WebError('SearXNG response exceeds byte budget', 'D_AI_SEARCH_RESPONSE_LIMIT')
            chunks.push(value)
          }
        } finally {
          await reader.cancel()
          reader.releaseLock()
        }
        const parsed = responseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        if (!parsed.success) throw new WebError('SearXNG response is not a valid results object', 'D_AI_SEARCH_RESPONSE')
        const sources: WebSearchSource[] = []
        const seen = new Set<string>()
        for (const result of parsed.data.results) {
          let target: URL
          try { target = new URL(result.url) } catch (_invalidURL) { continue /* Unusable source URLs are not citations. */ }
          if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || seen.has(target.href)) continue
          seen.add(target.href)
          sources.push({
            url: target.href,
            ...(result.title === undefined ? {} : { title: result.title }),
            ...(result.content === undefined ? {} : { snippet: result.content }),
          })
        }
        const limit = Math.min(request.maxResults ?? config.maxResults, config.maxResults)
        return { sources: sources.slice(0, limit), truncated: sources.length > limit }
      } finally {
        // Also close unread error bodies so a failed response does not retain a socket.
        if (response.body && !response.body.locked) await response.body.cancel()
      }
    },
  }
}

/** Register the provider as a disposable native web contribution.
 * @param ctx - plugin context owning the registration.
 * @param config - validated fixed endpoint and resource limits.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.web.registerSearchProvider(createSearxngProvider(config))
}
