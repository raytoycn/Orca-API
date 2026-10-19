import { z } from 'zod'
export { agentApiProfileContent } from './agent-api-profile-content'
import { AGENT_API_ARGUMENTS_ENV } from './agent-api-launch-args'
import {
  API_MODEL_KEY_PREFIX,
  agentApiCatalogGroups,
  agentApiCatalogCredentials
} from './agent-api-model-catalog'

import {
  AgentApiConnection,
  AGENT_API_PROTOCOLS,
  AGENT_SERVICE_API,
  isAgentServiceApi,
  type AgentApiAgent
} from './agent-api-connection-schema'
export * from './agent-api-connection-schema'

const OpenCodeConfig = z
  .object({
    provider: z.record(z.string(), z.unknown()).optional(),
    model: z.string().optional()
  })
  .passthrough()

function withoutNames(
  env: Record<string, string>,
  names: readonly string[]
): Record<string, string> {
  const excluded = new Set(names.map((name) => name.toUpperCase()))
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !excluded.has(name.toUpperCase()) && !name.toUpperCase().startsWith(API_MODEL_KEY_PREFIX)
    )
  )
}

const CLAUDE_API_NAMES = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL'
]
const OPENCODE_PROVIDER = 'orca-api'
const ENVIRONMENT_API_NAMES: Partial<Record<AgentApiAgent, readonly string[]>> = {
  'orca-agent': ['ORCA_MODEL_API_KEY', 'ORCA_HARNESS_PATCH', 'DSH_HOME'],
  hermes: [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'HERMES_INFERENCE_MODEL',
    'HERMES_INFERENCE_PROVIDER',
    'HERMES_IGNORE_USER_CONFIG',
    'ORCA_MODEL_API_KEY',
    'ORCA_HERMES_NATIVE_API'
  ],
  gemini: [
    'GEMINI_API_KEY',
    'GOOGLE_GEMINI_BASE_URL',
    'GEMINI_MODEL',
    'GEMINI_CLI_SYSTEM_SETTINGS_PATH'
  ],
  'qwen-code': [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'QWEN_CODE_SYSTEM_SETTINGS_PATH'
  ],
  aider: ['AIDER_OPENAI_API_KEY', 'AIDER_OPENAI_API_BASE', 'AIDER_MODEL'],
  goose: ['OPENAI_API_KEY', 'OPENAI_HOST', 'OPENAI_BASE_PATH', 'GOOSE_MODEL', 'GOOSE_PROVIDER'],
  codex: ['ORCA_MODEL_API_KEY', 'ORCA_CODEX_MODEL_CATALOG', AGENT_API_ARGUMENTS_ENV],
  pi: ['ORCA_MODEL_API_KEY', 'PI_CODING_AGENT_DIR', AGENT_API_ARGUMENTS_ENV],
  kimi: [
    'ORCA_KIMI_NATIVE_API',
    'KIMI_MODEL_NAME',
    'KIMI_MODEL_API_KEY',
    'KIMI_MODEL_BASE_URL',
    'KIMI_MODEL_PROVIDER_TYPE',
    'KIMI_MODEL_MAX_CONTEXT_SIZE',
    'KIMI_MODEL_CAPABILITIES'
  ]
}

export function isAgentApiEnvironmentName(agent: string, name: string): boolean {
  const normalized = name.toUpperCase()
  if (normalized.startsWith(API_MODEL_KEY_PREFIX) || normalized === 'ORCA_MODEL_API_KEY') {
    return true
  }
  const apiNames =
    agent === 'claude' || agent === 'claude-agent-teams'
      ? CLAUDE_API_NAMES
      : (Object.entries(ENVIRONMENT_API_NAMES).find(([key]) => key === agent)?.[1] ?? [])
  return apiNames.some((apiName) => apiName.toUpperCase() === normalized)
}

export function configureAgentApiEnvironment(
  current: Record<string, string>,
  input: AgentApiConnection,
  connections: readonly AgentApiConnection[] = []
): Record<string, string> {
  const connection = AgentApiConnection.parse(input)
  if (!AGENT_API_PROTOCOLS[connection.agent].includes(connection.protocol)) {
    throw new Error(
      connection.agent === 'claude'
        ? 'Claude Code requires an Anthropic Messages endpoint'
        : 'Unsupported API protocol for this agent'
    )
  }
  const baseUrl = connection.baseUrl.replace(/\/+$/, '')
  if (isAgentServiceApi(connection.agent)) {
    const service = AGENT_SERVICE_API[connection.agent]
    if (baseUrl !== service.baseUrl) {
      throw new Error('This agent uses its official service endpoint')
    }
    return { ...withoutNames(current, [service.key]), [service.key]: connection.apiKey }
  }
  if (connection.agent === 'gemini') {
    const url = new URL(baseUrl)
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Gemini requires HTTPS except for a localhost endpoint')
    }
  }
  if (connection.agent === 'claude' || connection.agent === 'claude-agent-teams') {
    if (connection.protocol !== 'anthropic-messages') {
      throw new Error('Claude Code requires an Anthropic Messages endpoint')
    }
    return {
      ...withoutNames(current, CLAUDE_API_NAMES),
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_MODEL: connection.model,
      ANTHROPIC_API_KEY: connection.credentialType === 'api-key' ? connection.apiKey : '',
      ANTHROPIC_AUTH_TOKEN: connection.credentialType === 'bearer' ? connection.apiKey : ''
    }
  }
  if (connection.agent !== 'opencode') {
    const env = withoutNames(current, ENVIRONMENT_API_NAMES[connection.agent] ?? [])
    switch (connection.agent) {
      case 'orca-agent':
        return {
          ...env,
          ...agentApiCatalogCredentials(connection, connections),
          ORCA_MODEL_API_KEY: connection.apiKey
        }
      case 'hermes':
        return {
          ...env,
          OPENAI_API_KEY: connection.apiKey,
          OPENAI_BASE_URL: baseUrl,
          HERMES_INFERENCE_MODEL: connection.model,
          HERMES_INFERENCE_PROVIDER: 'custom',
          HERMES_IGNORE_USER_CONFIG: '0',
          ORCA_MODEL_API_KEY: connection.apiKey,
          ORCA_HERMES_NATIVE_API: '1'
        }
      case 'gemini':
        return {
          ...env,
          GEMINI_API_KEY: connection.apiKey,
          GOOGLE_GEMINI_BASE_URL: baseUrl,
          GEMINI_MODEL: connection.model
        }
      case 'qwen-code':
        return {
          ...env,
          OPENAI_API_KEY: connection.apiKey,
          OPENAI_BASE_URL: baseUrl,
          OPENAI_MODEL: connection.model
        }
      case 'aider':
        return {
          ...env,
          AIDER_OPENAI_API_KEY: connection.apiKey,
          AIDER_OPENAI_API_BASE: baseUrl,
          AIDER_MODEL: connection.model.startsWith('openai/')
            ? connection.model
            : `openai/${connection.model}`
        }
      case 'goose': {
        const url = new URL(baseUrl)
        return {
          ...env,
          OPENAI_API_KEY: connection.apiKey,
          OPENAI_HOST: url.origin,
          OPENAI_BASE_PATH: `${url.pathname.replace(/^\/+|\/+$/g, '') || 'v1'}/chat/completions`,
          GOOSE_PROVIDER: 'openai',
          GOOSE_MODEL: connection.model
        }
      }
      case 'codex': {
        const overrides = {
          model: connection.model,
          model_provider: 'orca_api',
          'model_providers.orca_api.name': 'Orca API',
          'model_providers.orca_api.base_url': baseUrl,
          'model_providers.orca_api.env_key': 'ORCA_MODEL_API_KEY',
          'model_providers.orca_api.wire_api': 'responses',
          'model_providers.orca_api.requires_openai_auth': false
        }
        return {
          ...env,
          ORCA_MODEL_API_KEY: connection.apiKey,
          [AGENT_API_ARGUMENTS_ENV]: JSON.stringify(
            Object.entries(overrides).flatMap(([name, value]) => [
              '-c',
              `${name}=${JSON.stringify(value)}`
            ])
          )
        }
      }
      case 'pi':
        return { ...env, ORCA_MODEL_API_KEY: connection.apiKey }
      case 'kimi':
        return {
          ...env,
          KIMI_MODEL_NAME: connection.model,
          KIMI_MODEL_API_KEY: connection.apiKey,
          KIMI_MODEL_BASE_URL: baseUrl,
          KIMI_MODEL_PROVIDER_TYPE:
            connection.protocol === 'anthropic-messages' ? 'anthropic' : 'openai',
          KIMI_MODEL_MAX_CONTEXT_SIZE: String(connection.contextWindow ?? 1000000),
          KIMI_MODEL_CAPABILITIES: 'tool_use'
        }
    }
  }
  const config = OpenCodeConfig.parse(JSON.parse(current.OPENCODE_CONFIG_CONTENT ?? '{}'))
  const packages = {
    'anthropic-messages': '@ai-sdk/anthropic',
    'openai-completions': '@ai-sdk/openai-compatible',
    'openai-responses': '@ai-sdk/openai',
    'google-genai': '@ai-sdk/google',
    'agent-service': '@ai-sdk/openai'
  }
  return {
    ...current,
    ...agentApiCatalogCredentials(connection, connections),
    ORCA_MODEL_API_KEY: connection.apiKey,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      ...config,
      model: `${OPENCODE_PROVIDER}/${connection.model}`,
      provider: {
        ...Object.fromEntries(
          Object.entries(config.provider ?? {}).filter(
            ([name]) => name !== OPENCODE_PROVIDER && !/^orca-api-\d+$/.test(name)
          )
        ),
        ...Object.fromEntries(
          agentApiCatalogGroups(connection, connections).map((group) => [
            group.id,
            {
              npm: packages[group.connection.protocol],
              name: 'Orca API',
              options: {
                baseURL: group.connection.baseUrl.replace(/\/+$/, ''),
                apiKey: connections.length ? `{env:${group.keyEnv}}` : '{env:ORCA_MODEL_API_KEY}'
              },
              models: Object.fromEntries(
                group.models.map((model) => [model.model, { name: model.model }])
              )
            }
          ])
        )
      }
    })
  }
}

export function clearAgentApiEnvironment(
  current: Record<string, string>,
  agent: AgentApiAgent
): Record<string, string> {
  if (isAgentServiceApi(agent)) {
    return withoutNames(current, [AGENT_SERVICE_API[agent].key])
  }
  if (agent === 'claude' || agent === 'claude-agent-teams') {
    return withoutNames(current, CLAUDE_API_NAMES)
  }
  if (agent !== 'opencode') {
    return withoutNames(current, ENVIRONMENT_API_NAMES[agent] ?? [])
  }
  const env = { ...current }
  const config = OpenCodeConfig.parse(JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}'))
  for (const name of Object.keys(config.provider ?? {})) {
    if (name === OPENCODE_PROVIDER || /^orca-api-\d+$/.test(name)) {
      delete config.provider?.[name]
    }
  }
  if (config.model?.startsWith(`${OPENCODE_PROVIDER}/`)) {
    delete config.model
  }
  delete env.ORCA_MODEL_API_KEY
  env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
  return withoutNames(env, [])
}
