// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AgentApiPreset } from '../../../../shared/agent-api-presets'
import { summarizeAgentApiPresets } from '../../../../shared/agent-api-presets'
import { includeConfiguredApiModelsInSessionOptions } from '../../../../shared/agent-api-model-catalog'
import type { StructuredAgentSessionMutate } from './use-structured-agent-session-mutate'
import { useStructuredAgentSessionOptions } from './use-structured-agent-session-options'

const mocks = vi.hoisted(() => ({
  runtime: vi.fn(),
  read: vi.fn(),
  hold: vi.fn(),
  mutate: vi.fn()
}))
vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.read
}))
vi.mock('./use-host-model-catalog-upgrade', () => ({
  useHostModelCatalogUpgrade: () => ({ unavailable: undefined })
}))
vi.mock('@/runtime/structured-agent-session-host-capability', () => ({
  useStructuredAgentSessionHostCapability: () => true,
  structuredAgentSessionHostKey: () => 'local'
}))
vi.mock('./native-chat-session-option-settings-write', () => ({
  enqueueSessionOptionSettingsWrite: vi.fn()
}))
vi.mock('@/lib/structured-agent-session-launch-options', () => ({
  holdStructuredAgentSessionLaunchOption: mocks.hold,
  getStructuredAgentSessionLaunchSelection: () => null
}))
const target = { kind: 'local' } as const
const presets: AgentApiPreset[] = ['a', 'b'].map((id) => ({
  id,
  name: `API ${id}`,
  connection: {
    agent: 'orca-agent',
    protocol: 'openai-completions',
    baseUrl: `https://${id}.example/v1`,
    apiKey: `key-${id}`,
    credentialType: 'api-key',
    model: 'shared'
  },
  models: [
    { id: 'shared', name: 'Shared' },
    { id: `${id}-two`, name: 'Second' }
  ]
}))
const all = includeConfiguredApiModelsInSessionOptions(
  'orca-agent',
  { models: [], current: {} },
  presets
)
const oneModel = {
  models: [all.models[0]!],
  current: { model: all.models[0]!.id, permissionMode: 'ask' }
}
function setup(started: boolean, configuredPresets = presets) {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { runtime: { call: mocks.runtime } }
  })
  mocks.runtime.mockImplementation(async ({ method }: { method: string }) => ({
    id: 'api-model-fixture',
    ok: true,
    result:
      method === 'settings.getAgentLaunch'
        ? { settings: { apiPresets: summarizeAgentApiPresets(configuredPresets) } }
        : [],
    _meta: { runtimeId: 'local' }
  }))
  mocks.read.mockResolvedValue(oneModel)
  mocks.hold.mockReturnValue(Promise.resolve({ kind: 'accepted', options: {} }))
  mocks.mutate.mockImplementation(async (_name, _method, fields) => ({
    options: { [fields.key]: fields.value }
  }))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fake returns the setOption result used by this hook.
  const mutate = mocks.mutate as StructuredAgentSessionMutate
  return renderHook(() =>
    useStructuredAgentSessionOptions({
      agent: 'orca-agent',
      sessionId: 'api-model-test',
      target: started ? target : { ...target },
      transportEnabled: started,
      isVisible: true,
      providerVisible: started,
      fence: started ? 1 : null,
      turnId: null,
      unloadedTurnRevisions: undefined,
      mutate,
      launch: { kind: 'new', heldOptions: {} }
    })
  )
}
function modelChoices(
  snapshot: ReturnType<typeof useStructuredAgentSessionOptions>['optionSnapshot']
) {
  const model = snapshot.find((entry) => entry.id === 'model')
  return model?.kind.type === 'select' ? model.kind.choices : []
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('offers all APIs and models before the first message and holds the selected route', async () => {
  const { result } = setup(false)
  await waitFor(() => expect(modelChoices(result.current.optionSnapshot)).toHaveLength(4))
  const choice = all.models[3]!.id
  await act(async () => {
    expect(await result.current.setStructuredOption('model', choice)).toBe(true)
  })
  expect(mocks.hold).toHaveBeenCalledWith('api-model-test', 'model', choice)
  const permission = result.current.optionSnapshot.find((entry) => entry.id === 'permissionMode')
  expect(
    permission?.kind.type === 'select' ? permission.kind.choices.map((entry) => entry.value) : []
  ).toEqual(['ask', 'auto', 'full-access'])
})
it('keeps four models after a switch and the live agent refresh returns just one', async () => {
  const { result } = setup(true)
  await waitFor(() => expect(modelChoices(result.current.optionSnapshot)).toHaveLength(4))
  const choice = all.models[3]!.id
  await act(async () => {
    expect(await result.current.setStructuredOption('model', choice)).toBe(true)
  })
  await waitFor(() => expect(mocks.read).toHaveBeenCalled())
  expect(modelChoices(result.current.optionSnapshot)).toHaveLength(4)
  expect(mocks.mutate).toHaveBeenCalledWith('agentSession.setOption', 'agentSession.setOption', {
    key: 'model',
    value: choice
  })
})

it('reads the real preload RPC envelope before any prompt and always retains the supplier', async () => {
  const { result } = setup(false, [presets[0]!])
  await waitFor(() => expect(modelChoices(result.current.optionSnapshot)).toHaveLength(2))
  expect(mocks.runtime).toHaveBeenCalledWith({
    method: 'settings.getAgentLaunch',
    params: undefined
  })
  expect(modelChoices(result.current.optionSnapshot).map((choice) => choice.provider)).toEqual([
    { id: 'a', label: 'API a · a.example' },
    { id: 'a', label: 'API a · a.example' }
  ])
  expect(mocks.mutate).not.toHaveBeenCalled()
  expect(mocks.read).not.toHaveBeenCalled()
})

it('does not refetch when React recreates the same runtime target', async () => {
  const { result, rerender } = setup(false)
  await waitFor(() => expect(modelChoices(result.current.optionSnapshot)).toHaveLength(4))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  const count = mocks.runtime.mock.calls.length
  rerender()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(mocks.runtime.mock.calls.length).toBe(count)
  expect(
    mocks.runtime.mock.calls.filter(([request]) => request.method === 'settings.getAgentLaunch')
  ).toHaveLength(2)
})

it('discovers the full catalog from a single cached model without sending a prompt', async () => {
  const cached = { ...presets[0]!, models: [presets[0]!.models![0]!] }
  const { result } = setup(false, [cached])
  mocks.runtime.mockImplementation(async ({ method }: { method: string }) => {
    if (method === 'settings.listAgentApiModels') {
      cached.models = presets[0]!.models!
    }
    return {
      id: 'catalog-refresh',
      ok: true,
      result:
        method === 'settings.getAgentLaunch'
          ? { settings: { apiPresets: summarizeAgentApiPresets([cached]) } }
          : cached.models,
      _meta: { runtimeId: 'local' }
    }
  })
  await waitFor(() => expect(modelChoices(result.current.optionSnapshot)).toHaveLength(2))
  expect(mocks.runtime).toHaveBeenCalledWith({
    method: 'settings.listAgentApiModels',
    params: {
      agent: 'orca-agent',
      protocol: 'openai-completions',
      baseUrl: 'https://a.example/v1',
      credentialType: 'api-key',
      presetId: 'a'
    }
  })
  expect(mocks.read).not.toHaveBeenCalled()
  expect(mocks.mutate).not.toHaveBeenCalled()
})
