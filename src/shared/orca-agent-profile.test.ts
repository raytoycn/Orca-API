import { expect, it } from 'vitest'
import type { AgentApiConnection } from './agent-api-connection-schema'
import { orcaAgentProfileContent } from './orca-agent-profile'

const connection: AgentApiConnection = {
  agent: 'orca-agent',
  protocol: 'openai-completions',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-reasoner',
  apiKey: 'test-secret',
  credentialType: 'api-key'
}

it('declares selectable reasoning levels for Orca Agent models', () => {
  const profile = JSON.parse(orcaAgentProfileContent(connection)) as {
    id: string
    config?: {
      providers?: Record<
        string,
        {
          compat?: { thinkingFormat?: string }
          models?: { id: string; reasoningEfforts: Record<string, string | null> }[]
        }
      >
    }
  }[]
  const provider = profile.find(({ id }) => id === 'llm-pi-ai')?.config?.providers
  const route = Object.values(provider ?? {})[0]

  expect(route?.models?.[0]).toMatchObject({
    id: 'deepseek-reasoner',
    reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' }
  })
  expect(route?.compat).toEqual({ thinkingFormat: 'deepseek' })
})

it('keeps DeepSeek-specific thinking transport off other providers', () => {
  const profile = JSON.parse(
    orcaAgentProfileContent({ ...connection, baseUrl: 'https://gateway.example/v1' })
  ) as { id: string; config?: { providers?: Record<string, { compat?: unknown }> } }[]
  const provider = profile.find(({ id }) => id === 'llm-pi-ai')?.config?.providers

  expect(Object.values(provider ?? {})[0]?.compat).toBeUndefined()
})
