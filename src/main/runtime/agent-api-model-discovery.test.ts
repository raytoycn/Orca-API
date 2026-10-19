import { describe, expect, it, vi } from 'vitest'
import { discoverAgentApiModels } from './agent-api-model-discovery'

const request = {
  agent: 'kimi',
  protocol: 'openai-completions',
  baseUrl: 'https://example.test/api/v1',
  apiKey: 'fixture-key',
  credentialType: 'api-key'
} as const
describe('API model discovery', () => {
  it('preserves gateway prefixes, sends the credential in a header and reads context limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'model-b' },
            { id: 'model-a', context_length: 65536 },
            { id: 'model-a', context_window: 131072 }
          ]
        })
      )
    )
    expect(await discoverAgentApiModels(request, fetcher)).toEqual([
      { id: 'model-a', name: 'model-a', contextWindow: 131072 },
      { id: 'model-b', name: 'model-b' }
    ])
    expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test/api/v1/models')
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer fixture-key' },
      redirect: 'error'
    })
  })
  it('pages through Anthropic models with the appropriate authentication', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'one' }], has_more: true, last_id: 'one' }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ id: 'two', max_input_tokens: 200000 }] }))
      )
    expect(
      await discoverAgentApiModels(
        {
          ...request,
          agent: 'claude',
          protocol: 'anthropic-messages',
          baseUrl: 'https://example.test/anthropic'
        },
        fetcher
      )
    ).toHaveLength(2)
    expect(String(fetcher.mock.calls[1][0])).toBe(
      'https://example.test/anthropic/v1/models?after_id=one'
    )
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'fixture-key' })
  })
  it('reads Google model names, pagination and input token limits', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: 'models/gemini-test', displayName: 'Gemini Test', inputTokenLimit: 32768 }
          ]
        })
      )
    )
    expect(
      await discoverAgentApiModels(
        { ...request, agent: 'gemini', protocol: 'google-genai', baseUrl: 'https://example.test' },
        fetcher
      )
    ).toEqual([{ id: 'gemini-test', name: 'Gemini Test', contextWindow: 32768 }])
    expect(String(fetcher.mock.calls[0][0])).toBe('https://example.test/v1beta/models')
  })
  it('does not expose service bodies in errors or accept a non-catalog response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('private-key', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}'))
    await expect(discoverAgentApiModels(request, fetcher)).rejects.toThrow('HTTP 401')
    await expect(discoverAgentApiModels(request, fetcher)).rejects.toThrow(
      'did not return a model list'
    )
  })
})
