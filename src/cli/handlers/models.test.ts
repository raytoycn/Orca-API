import { afterEach, describe, expect, it, vi } from 'vitest'
import { MODELS_HANDLERS } from './models'
import type { HandlerContext } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'

const preset = {
  id: 'provider-a',
  name: 'Provider A',
  connection: {
    agent: 'claude',
    protocol: 'anthropic-messages',
    baseUrl: 'https://a.example/v1',
    model: 'claude-model',
    credentialType: 'api-key'
  },
  models: [
    { id: 'claude-model', name: 'Claude Model' },
    { id: 'claude-model-large', name: 'Claude Model Large' }
  ]
}

const settings = {
  apiPresets: [preset],
  activeApiPresets: { 'orca-agent': undefined },
  apiConfigurationAgents: [
    'orca-agent',
    'claude',
    'codex',
    'opencode',
    'hermes',
    'gemini',
    'qwen-code',
    'aider',
    'goose',
    'pi',
    'kimi',
    'claude-agent-teams',
    'cursor',
    'amp'
  ],
  defaultTuiAgent: null,
  disabledTuiAgents: [],
  agentCmdOverrides: {},
  agentDefaultArgs: {},
  environmentNames: {},
  permissionMode: 'ask'
}

function context(call: unknown, flags: Record<string, string | boolean>): HandlerContext {
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only `call`; a real RuntimeClient would open the runtime socket.
    client: { call } as RuntimeClient,
    cwd: '/repo',
    flags: new Map(Object.entries(flags)),
    json: false,
    rawArgs: []
  }
}

describe('orca models', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists API and account-backed models', async () => {
    const call = vi.fn(async (method: string, params?: unknown) => {
      if (method === 'settings.getAgentLaunch') {
        return {
          id: 'request-1',
          ok: true,
          result: { settings },
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      if (method === 'settings.listAgentApiModels') {
        return {
          id: 'request-2',
          ok: true,
          result: preset.models,
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      if (
        method === 'agentSession.modelCatalog' &&
        (params as { agent: string }).agent === 'grok'
      ) {
        return {
          id: 'request-3',
          ok: true,
          result: {
            origin: 'probe',
            fetchedAt: 1,
            models: [
              {
                id: 'grok-4.7',
                label: 'Grok 4.7',
                isDefault: true,
                efforts: []
              }
            ]
          },
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      return {
        id: 'request-4',
        ok: true,
        result: { origin: 'unknown' },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const ctx = context(call, {})

    await MODELS_HANDLERS['models list']!(ctx)

    const output = log.mock.calls[0]?.[0] as string
    expect(output).toMatch(/claude\s+api\s+Provider A\s+Claude Model\s+yes/)
    expect(output).toMatch(/grok\s+account\s+grok\s+Grok 4\.7\s+no/)
  })

  it('bridges a compatible API model into Orca Agent', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'settings.getAgentLaunch') {
        return {
          id: 'request-1',
          ok: true,
          result: { settings },
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      if (method === 'settings.listAgentApiModels') {
        return {
          id: 'request-2',
          ok: true,
          result: preset.models,
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      return {
        id: 'request-3',
        ok: true,
        result: { settings },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const ctx = context(call, { model: 'claude-model-large' })

    await MODELS_HANDLERS['models use']!(ctx)

    expect(call).toHaveBeenCalledWith('settings.mutateAgentLaunch', {
      type: 'api-preset-activate',
      agent: 'orca-agent',
      id: 'provider-a',
      model: 'claude-model-large'
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('agent: orca-agent'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('model: claude-model-large'))
  })

  it('rejects a model that is only account-backed', async () => {
    const call = vi.fn(async (method: string) => {
      if (method === 'settings.getAgentLaunch') {
        return {
          id: 'request-1',
          ok: true,
          result: { settings: { ...settings, apiPresets: [] } },
          _meta: { runtimeId: 'runtime-1' }
        }
      }
      return {
        id: 'request-2',
        ok: true,
        result: { origin: 'unknown' },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    const ctx = context(call, { model: 'grok-4.7' })

    await expect(MODELS_HANDLERS['models use']!(ctx)).rejects.toThrow(/No API-backed model/)
  })
})
