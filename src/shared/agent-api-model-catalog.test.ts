import { expect, it } from 'vitest'
import type { AgentApiPreset } from './agent-api-presets'
import type { AgentSessionOptionsResult } from './agent-session-wire'
import { includeConfiguredApiModelsInSessionOptions } from './agent-api-model-catalog'

const presets: AgentApiPreset[] = [
  {
    id: 'provider-a',
    name: 'Provider A',
    connection: {
      agent: 'orca-agent',
      protocol: 'openai-completions',
      baseUrl: 'https://a.example/v1',
      model: 'a-one',
      apiKey: 'secret-a',
      credentialType: 'api-key'
    },
    models: [
      { id: 'a-one', name: 'A One' },
      { id: 'a-two', name: 'A Two' }
    ]
  },
  {
    id: 'provider-b',
    name: 'Provider B',
    connection: {
      agent: 'orca-agent',
      protocol: 'openai-completions',
      baseUrl: 'https://b.example/v1',
      model: 'b-one',
      apiKey: 'secret-b',
      credentialType: 'api-key'
    },
    models: [{ id: 'b-one', name: 'B One' }]
  },
  {
    id: 'other-agent',
    name: 'Other Agent',
    connection: {
      agent: 'claude',
      protocol: 'anthropic-messages',
      baseUrl: 'https://c.example/v1',
      model: 'c-one',
      apiKey: 'secret-c',
      credentialType: 'api-key'
    },
    models: [{ id: 'c-one', name: 'C One' }]
  }
]

const options: AgentSessionOptionsResult = {
  models: [
    { id: 'a-one', label: 'Agent A One', isDefault: true, efforts: [] },
    { id: 'agent-only', label: 'Agent Only', isDefault: false, efforts: [] }
  ],
  current: { model: 'a-one' }
}

it('adds every configured API model while preserving agent rows and excluding other agents', () => {
  const merged = includeConfiguredApiModelsInSessionOptions('orca-agent', options, presets)

  expect(merged.models.map(({ id }) => id)).toEqual(['a-one', 'agent-only', 'a-two', 'b-one'])
  expect(merged.models[0]).toEqual(options.models[0])
  expect(merged.models.find(({ id }) => id === 'a-two')?.label).toBe('A Two 路 Provider A')
  expect(merged.models.some(({ id }) => id === 'c-one')).toBe(false)
})
