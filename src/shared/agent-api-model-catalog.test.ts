import { summarizeAgentApiPresets } from './agent-api-presets'
import { uniqueOrcaAgentApiPresets } from './agent-api-model-catalog'
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

it('keeps distinct provider-qualified choices for every API, including same-name models', () => {
  const sameName = { ...presets[1]!, models: [{ id: 'a-one', name: 'Other A One' }] }
  const merged = includeConfiguredApiModelsInSessionOptions(
    'orca-agent',
    { models: [], current: {} },
    [presets[0]!, sameName, presets[2]!]
  )
  expect(merged.models).toHaveLength(4)
  expect(new Set(merged.models.map((model) => model.id)).size).toBe(4)
  expect(merged.models.map((model) => JSON.parse(model.id)[1])).toEqual([
    'a-one',
    'a-two',
    'a-one',
    'c-one'
  ])
  expect(merged.models[1]?.label).toBe('A Two')
  expect(merged.models[1]?.provider).toEqual({ id: 'provider-a', label: 'Provider A · a.example' })
})

it('uses the same IDs in sanitized settings and live Harness options', () => {
  const summaries = summarizeAgentApiPresets(presets)
  const configured = includeConfiguredApiModelsInSessionOptions(
    'orca-agent',
    { models: [], current: {} },
    presets
  )
  const live = { models: [configured.models[0]!], current: { model: configured.models[0]!.id } }
  const merged = includeConfiguredApiModelsInSessionOptions('orca-agent', live, summaries)
  expect(merged.models).toHaveLength(4)
  expect(merged.models[0]).toMatchObject(live.models[0]!)
  expect(merged.current).toEqual(live.current)
  expect(JSON.stringify(summaries)).not.toContain('secret-')
})

it('retains other agents existing native IDs', () => {
  const merged = includeConfiguredApiModelsInSessionOptions('claude', options, presets)
  expect(merged.models.map(({ id }) => id)).toEqual(['a-one', 'agent-only', 'c-one'])
})

it('bridges compatible API presets from other agents into Orca Agent', () => {
  const merged = includeConfiguredApiModelsInSessionOptions(
    'orca-agent',
    { models: [], current: {} },
    [presets[2]!]
  )
  expect(merged.models).toHaveLength(1)
  expect(JSON.parse(merged.models[0]!.id)[1]).toBe('c-one')
  expect(merged.models[0]!.provider?.label).toContain('Other Agent')
})

it('deduplicates presets that point at the same provider', () => {
  const sameProvider = {
    ...presets[0]!,
    id: 'same-provider-copy',
    name: 'a.example',
    models: [
      { id: 'a-one', name: 'A One' },
      { id: 'a-three', name: 'A Three' }
    ]
  }
  const unique = uniqueOrcaAgentApiPresets(summarizeAgentApiPresets([presets[0]!, sameProvider]))
  expect(unique).toHaveLength(1)
  expect(unique[0]?.models?.map(({ id }) => id)).toEqual(['a-one', 'a-two', 'a-three'])
  expect(unique[0]?.name).toBe('Provider A')
})
