import { describe, expect, it } from 'vitest'
import {
  AgentApiConnection,
  configureAgentApiEnvironment,
  clearAgentApiEnvironment,
  isAgentApiEnvironmentName
} from './agent-api-connection'
import {
  agentLaunchSettingsMutationUpdates,
  projectAgentLaunchSettings
} from './agent-launch-settings'

const connection: AgentApiConnection = {
  agent: 'claude',
  protocol: 'anthropic-messages',
  baseUrl: 'https://api.example.test/anthropic/',
  model: 'model-a',
  apiKey: 'fixture-secret',
  credentialType: 'api-key'
}

describe('per-agent API connections', () => {
  it.each([
    {
      agent: 'hermes',
      protocol: 'openai-completions',
      key: 'OPENAI_API_KEY',
      model: 'HERMES_INFERENCE_MODEL'
    },
    { agent: 'gemini', protocol: 'google-genai', key: 'GEMINI_API_KEY', model: 'GEMINI_MODEL' },
    {
      agent: 'qwen-code',
      protocol: 'openai-completions',
      key: 'OPENAI_API_KEY',
      model: 'OPENAI_MODEL'
    },
    {
      agent: 'aider',
      protocol: 'openai-completions',
      key: 'AIDER_OPENAI_API_KEY',
      model: 'AIDER_MODEL'
    },
    { agent: 'goose', protocol: 'openai-completions', key: 'OPENAI_API_KEY', model: 'GOOSE_MODEL' }
  ] as const)(
    'configures and clears $agent without altering other environment values',
    ({ agent, protocol, key, model }) => {
      const before = { KEEP: 'yes' }
      const env = configureAgentApiEnvironment(before, { ...connection, agent, protocol })
      expect(env[key]).toBe(connection.apiKey)
      expect(env[model]).toBe(agent === 'aider' ? 'openai/model-a' : 'model-a')
      expect(clearAgentApiEnvironment(env, agent)).toEqual(before)
      expect(before).toEqual({ KEEP: 'yes' })
    }
  )
  it('separates Goose host and request path without duplicating v1', () => {
    const env = configureAgentApiEnvironment(
      {},
      {
        ...connection,
        agent: 'goose',
        protocol: 'openai-completions',
        baseUrl: 'https://api.example.test/custom/v1/'
      }
    )
    expect(env).toMatchObject({
      OPENAI_HOST: 'https://api.example.test',
      OPENAI_BASE_PATH: 'custom/v1/chat/completions',
      GOOSE_PROVIDER: 'openai'
    })
  })
  it('rejects unsupported protocols for each new adapter', () => {
    for (const agent of ['gemini', 'qwen-code', 'aider', 'goose'] as const) {
      expect(() => configureAgentApiEnvironment({}, { ...connection, agent })).toThrow(
        'Unsupported API protocol'
      )
    }
  })
  it('configures Claude directly and suppresses a conflicting token without changing other variables', () => {
    const env = configureAgentApiEnvironment(
      { PATH: 'keep', anthropic_auth_token: 'old' },
      connection
    )
    expect(env).toMatchObject({
      PATH: 'keep',
      ANTHROPIC_BASE_URL: 'https://api.example.test/anthropic',
      ANTHROPIC_API_KEY: 'fixture-secret',
      ANTHROPIC_AUTH_TOKEN: '',
      ANTHROPIC_MODEL: 'model-a'
    })
    expect(env).not.toHaveProperty('anthropic_auth_token')
  })
  it('rejects incompatible Claude protocols before modifying the source', () => {
    const before = { PATH: 'keep' }
    expect(() =>
      configureAgentApiEnvironment(before, { ...connection, protocol: 'openai-completions' })
    ).toThrow('Anthropic Messages')
    expect(before).toEqual({ PATH: 'keep' })
  })
  it.each(['openai-completions', 'openai-responses', 'anthropic-messages'] as const)(
    'preserves OpenCode configuration with %s',
    (protocol) => {
      const before = {
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          instructions: ['README.md'],
          provider: { existing: { name: 'Keep' } }
        })
      }
      const env = configureAgentApiEnvironment(before, {
        ...connection,
        agent: 'opencode',
        protocol
      })
      expect(env.OPENCODE_CONFIG_CONTENT).not.toContain(connection.apiKey)
      expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT)).toMatchObject({
        instructions: ['README.md'],
        model: 'orca-api/model-a',
        provider: { existing: { name: 'Keep' } }
      })
      expect(env.ORCA_MODEL_API_KEY).toBe(connection.apiKey)
      const restored = clearAgentApiEnvironment(env, 'opencode')
      expect(restored).not.toHaveProperty('ORCA_MODEL_API_KEY')
      expect(JSON.parse(restored.OPENCODE_CONFIG_CONTENT)).toEqual(
        JSON.parse(before.OPENCODE_CONFIG_CONTENT)
      )
    }
  )
  it('does not overwrite invalid existing OpenCode JSON', () => {
    expect(() =>
      configureAgentApiEnvironment(
        { OPENCODE_CONFIG_CONTENT: 'invalid' },
        { ...connection, agent: 'opencode' }
      )
    ).toThrow()
  })
  it('commits only the selected agent and never projects its key back to the client', () => {
    const before = { agentDefaultEnv: { codex: { KEEP: 'yes' }, claude: { PATH: 'keep' } } }
    const update = agentLaunchSettingsMutationUpdates(
      before,
      { type: 'api-set', connection },
      'win32'
    )
    expect(update.agentDefaultEnv?.codex).toEqual({ KEEP: 'yes' })
    expect(JSON.stringify(projectAgentLaunchSettings({ ...before, ...update }))).not.toContain(
      connection.apiKey
    )
    const cleared = agentLaunchSettingsMutationUpdates(
      update,
      { type: 'api-clear', agent: 'claude' },
      'win32'
    )
    expect(cleared.agentDefaultEnv?.claude).toEqual({ PATH: 'keep' })
  })
  it('hides API-owned launch variables and removes them when the API override is cleared', () => {
    const before = {
      agentDefaultEnv: {
        'orca-agent': {
          DSH_HOME: 'managed-home',
          ORCA_API_MODEL_KEY_0: 'fixture-secret',
          ORCA_HARNESS_PATCH: 'managed-profile',
          ORCA_MODEL_API_KEY: 'fixture-secret',
          KEEP: 'user-value'
        }
      }
    }

    expect(isAgentApiEnvironmentName('orca-agent', 'DSH_HOME')).toBe(true)
    expect(isAgentApiEnvironmentName('orca-agent', 'ORCA_API_MODEL_KEY_0')).toBe(true)
    expect(projectAgentLaunchSettings(before).environmentNames['orca-agent']).toEqual(['KEEP'])
    expect(
      agentLaunchSettingsMutationUpdates(before, { type: 'api-clear', agent: 'orca-agent' }, 'win32')
        .agentDefaultEnv?.['orca-agent']
    ).toEqual({ KEEP: 'user-value' })
  })
  it.each(['cursor', 'amp'] as const)(
    'keeps %s platform credentials separate from model APIs',
    (agent) => {
      const baseUrl = agent === 'cursor' ? 'https://api.cursor.com' : 'https://ampcode.com'
      const key = agent === 'cursor' ? 'CURSOR_API_KEY' : 'AMP_API_KEY'
      const env = configureAgentApiEnvironment(
        { KEEP: 'yes' },
        {
          ...connection,
          agent,
          protocol: 'agent-service',
          baseUrl
        }
      )
      expect(env).toEqual({ KEEP: 'yes', [key]: connection.apiKey })
      expect(clearAgentApiEnvironment(env, agent)).toEqual({ KEEP: 'yes' })
      expect(() =>
        configureAgentApiEnvironment(
          {},
          {
            ...connection,
            agent,
            protocol: 'openai-completions',
            baseUrl
          }
        )
      ).toThrow('Unsupported API protocol')
      expect(() =>
        configureAgentApiEnvironment(
          {},
          {
            ...connection,
            agent,
            protocol: 'agent-service'
          }
        )
      ).toThrow('official service endpoint')
    }
  )
  it('uses modern Kimi model overrides and clears all owned fields', () => {
    const env = configureAgentApiEnvironment(
      { KEEP: 'yes' },
      {
        ...connection,
        agent: 'kimi',
        protocol: 'openai-completions',
        contextWindow: 131072
      }
    )
    expect(env).toMatchObject({
      KIMI_MODEL_API_KEY: connection.apiKey,
      KIMI_MODEL_NAME: connection.model,
      KIMI_MODEL_PROVIDER_TYPE: 'openai',
      KIMI_MODEL_MAX_CONTEXT_SIZE: '131072'
    })
    expect(clearAgentApiEnvironment(env, 'kimi')).toEqual({ KEEP: 'yes' })
    expect(env).not.toHaveProperty('ORCA_AGENT_API_ARGUMENTS')
  })
  it.each([
    'https://user:secret@example.test',
    'https://example.test?key=secret',
    'file:///tmp/api'
  ])('rejects credential-bearing or non-HTTP URLs: %s', (baseUrl) => {
    expect(AgentApiConnection.safeParse({ ...connection, baseUrl }).success).toBe(false)
  })
})
