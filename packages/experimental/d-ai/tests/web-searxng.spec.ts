/** SearXNG wire behavior via a real HTTP service and native Loader composition. */
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { once } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import WebRuntime from '@deepseek-ai/dsh-web'
import { describe, expect, it } from 'vitest'
import * as Search from '../src/web-searxng.ts'

async function server<T>(respond: (url: URL, response: ServerResponse) => void, run: (baseURL: string) => Promise<T>) {
  const service = createServer((request, response) =>{  respond(new URL(request.url!, 'http://localhost'), response) })
  service.listen(0, '127.0.0.1')
  await once(service, 'listening')
  const address = service.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  try { return await run(`http://127.0.0.1:${address.port}/`) } finally {
    service.closeAllConnections()
    await new Promise<void>((resolve, reject) => service.close((error) => {
      if (error) reject(error)
      else resolve()
    }))
  }
}

function provider(baseURL: string, config: Partial<Search.Config> = {}) {
  return Search.createSearxngProvider({ baseURL, timeoutMs: 1000, maxResponseBytes: 4096, maxResults: 10, maxQueryBytes: 4096, ...config })
}

describe('D_AI SearXNG native provider', () => {
  it('loads a native search provider, preserves sources and removes the registration on disposal', async () => server((url, response) => {
    expect(url.pathname).toBe('/search')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('q')).toBe('أبحاث الذكاء الاصطناعي')
    response.end(JSON.stringify({ results: [
      { url: 'https://example.org/a', title: 'Primary source', content: 'A reported result.' },
      { url: 'https://example.org/a', title: 'Duplicate' },
      { url: 'javascript:alert(1)' },
      { url: 'https://example.org/b' },
    ] }))
  }, async (baseURL) => {
    const root = await mkdtemp(join(tmpdir(), 'd-ai-search-'))
    const ctx = new Context()
    try {
      await ctx.plugin(WebRuntime, { searchProvider: 'dai-searxng' })
      await writeFile(join(root, 'cordis.yml'), `- name: 'fixture:search'\n  config:\n    baseURL: ${JSON.stringify(baseURL)}\n`)
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      ctx.loader.internal = ({ version: 'v2', import: async () => Search } as never)
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } })
      await ctx.loader.await()
      expect([...ctx.loader.entries()].filter(entry => !entry.disabled && !entry.fiber)).toEqual([])
      expect(await ctx.web.search({ query: 'أبحاث الذكاء الاصطناعي', maxResults: 1 })).toEqual({
        sources: [{ url: 'https://example.org/a', title: 'Primary source', snippet: 'A reported result.' }], truncated: true,
      })
      const contribution = [...ctx.loader.entries()].find(entry => entry.options.name === 'fixture:search')!
      await contribution.fiber!.dispose()
      await expect(ctx.web.search({ query: 'again' })).rejects.toMatchObject({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' })
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  }))

  it('reports a JSON-disabled instance instead of silently returning an empty result', async () => server((_url, response) => {
    response.writeHead(403); response.end('Forbidden')
  }, async (url) => {
    await expect(provider(url).search({ query: 'research' })).rejects.toMatchObject({ code: 'D_AI_SEARCH_HTTP' })
  }))

  it('rejects oversized streamed multibyte results', async () => server((_url, response) => {
    response.end(JSON.stringify({ results: [{ url: 'https://example.org', content: 'ع'.repeat(100) }] }))
  }, async (url) => {
    await expect(provider(url, { maxResponseBytes: 100 }).search({ query: 'research' })).rejects.toMatchObject({ code: 'D_AI_SEARCH_RESPONSE_LIMIT' })
  }))

  it('rejects unexpected JSON fields before inventing a successful search', async () => server((_url, response) => {
    response.end(JSON.stringify({ error: 'engine failed' }))
  }, async (url) => {
    await expect(provider(url).search({ query: 'research' })).rejects.toMatchObject({ code: 'D_AI_SEARCH_RESPONSE' })
  }))

  it('refuses redirects to a different service', async () => server((_url, response) => {
    response.writeHead(302, { Location: 'http://127.0.0.1:1/private' }); response.end()
  }, async (url) => {
    await expect(provider(url).search({ query: 'research' })).rejects.toThrow()
  }))

  it('honors cancellation before dispatch', async () => {
    await expect(provider('http://127.0.0.1:1/').search({ query: 'research' }, AbortSignal.abort(new Error('cancelled')))).rejects.toThrow('cancelled')
  })

  it('times out a stalled response body and closes the socket', async () => server((_url, response) => {
    response.writeHead(200); response.write('{')
  }, async (url) => {
    await expect(provider(url, { timeoutMs: 100 }).search({ query: 'research' })).rejects.toThrow()
  }))

  it.each(['file:///etc/', 'https://user:pass@example.org/', 'https://example.org/?endpoint=other'])('rejects unsafe endpoint %s at load', (value) => {
    expect(() => provider(value)).toThrow()
  })
})
