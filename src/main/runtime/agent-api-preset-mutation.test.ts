import { expect, it } from 'vitest'
import { resolveAgentApiPresetMutation } from './agent-api-preset-mutation'
import {
  agentLaunchSettingsMutationUpdates,
  projectAgentLaunchSettings,
  type AgentLaunchSettingsSource
} from '../../shared/agent-launch-settings'
import { summarizeAgentApiPresets } from '../../shared/agent-api-presets'

const connection = {
  agent: 'kimi',
  protocol: 'openai-completions',
  baseUrl: 'https://example.test/v1',
  model: 'model-a',
  apiKey: 'fixture-key-a',
  credentialType: 'api-key',
  contextWindow: 1000000
} as const
it('retains independent credentials for two APIs and switches the launched model without exposing secrets', () => {
  let state: AgentLaunchSettingsSource = {}
  const modelCatalog = [
    { id: 'model-a', name: 'Model A', contextWindow: 1000000 },
    { id: 'model-a-large', name: 'Model A Large', contextWindow: 2000000 }
  ]
  for (const [id, apiKey] of [
    ['a', 'fixture-key-a'],
    ['b', 'fixture-key-b']
  ]) {
    const resolved = resolveAgentApiPresetMutation(state, {
      type: 'api-preset-save',
      preset: {
        id,
        name: id,
        connection: { ...connection, apiKey, model: id },
        ...(id === 'a' ? { models: modelCatalog } : {})
      }
    })
    state = {
      ...state,
      ...agentLaunchSettingsMutationUpdates(state, resolved.mutation, 'win32'),
      ...resolved.updates
    }
  }
  const activated = resolveAgentApiPresetMutation(state, {
    type: 'api-preset-activate',
    agent: 'kimi',
    id: 'a'
  })
  state = {
    ...state,
    ...agentLaunchSettingsMutationUpdates(state, activated.mutation, 'win32'),
    ...activated.updates
  }
  expect(state.agentApiPresets).toHaveLength(2)
  expect(state.agentApiPresets?.find((preset) => preset.id === 'a')?.models).toEqual(modelCatalog)
  expect(summarizeAgentApiPresets(state.agentApiPresets ?? [])).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'a', models: modelCatalog })])
  )
  expect(JSON.stringify(summarizeAgentApiPresets(state.agentApiPresets ?? []))).not.toContain(
    'fixture-key'
  )
  expect(state.agentDefaultEnv?.kimi).toMatchObject({
    KIMI_MODEL_NAME: 'a',
    KIMI_MODEL_API_KEY: 'fixture-key-a',
    KIMI_MODEL_MAX_CONTEXT_SIZE: '1000000'
  })
  const modelSelection = resolveAgentApiPresetMutation(state, {
    type: 'api-preset-activate',
    agent: 'kimi',
    id: 'a',
    model: 'model-a-large',
    contextWindow: 2000000
  })
  state = {
    ...state,
    ...agentLaunchSettingsMutationUpdates(state, modelSelection.mutation, 'win32'),
    ...modelSelection.updates
  }
  expect(state.agentApiPresets?.find((preset) => preset.id === 'a')?.connection).toMatchObject({
    model: 'model-a-large',
    contextWindow: 2000000
  })
  expect(state.agentApiPresets?.find((preset) => preset.id === 'a')?.models).toEqual(modelCatalog)
  expect(state.agentDefaultEnv?.kimi).toMatchObject({
    KIMI_MODEL_NAME: 'model-a-large',
    KIMI_MODEL_MAX_CONTEXT_SIZE: '2000000'
  })
  expect(JSON.stringify(projectAgentLaunchSettings(state))).not.toContain('fixture-key')
  const updated = resolveAgentApiPresetMutation(state, {
    type: 'api-preset-save',
    preset: { id: 'a', name: 'renamed', connection: { ...connection, apiKey: undefined } }
  })
  expect(updated.mutation).toMatchObject({ connection: { apiKey: 'fixture-key-a' } })
  const removed = resolveAgentApiPresetMutation(state, {
    type: 'api-preset-delete',
    agent: 'kimi',
    id: 'a'
  })
  expect(removed.mutation).toEqual({ type: 'api-clear', agent: 'kimi' })
  expect(removed.updates.agentApiPresets?.map((preset) => preset.id)).toEqual(['b'])
  expect(() =>
    resolveAgentApiPresetMutation(state, { type: 'api-preset-activate', agent: 'claude', id: 'a' })
  ).toThrow('mismatch')
  expect(() =>
    resolveAgentApiPresetMutation(state, {
      type: 'api-preset-save',
      preset: {
        id: 'a',
        name: 'edited',
        connection: { ...connection, apiKey: undefined, baseUrl: 'https://other.test/v1' }
      }
    })
  ).toThrow('changed endpoint')
})
