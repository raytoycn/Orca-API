import type { AgentApiConnection } from './agent-api-connection-schema'
import { agentApiCatalogGroups } from './agent-api-model-catalog'
import { DEFAULT_API_CONTEXT_WINDOW } from './agent-api-presets'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

function providerId(connection: AgentApiConnection): string {
  const identity = JSON.stringify([
    connection.baseUrl,
    connection.protocol,
    connection.credentialType,
    connection.apiKey
  ])
  return `orca-${bytesToHex(sha256(identity))}`
}

export function orcaAgentProfileContent(
  active: AgentApiConnection,
  connections: readonly AgentApiConnection[] = []
): string {
  const groups = agentApiCatalogGroups(active, connections)
  return JSON.stringify(
    [
      { id: 'llm-deepseek', disabled: true },
      { id: 'llm-deepseek-account', disabled: true },
      {
        id: 'llm-pi-ai',
        disabled: false,
        config: {
          providers: Object.fromEntries(
            groups.map((group) => [
              providerId(group.connection),
              {
                displayName: `Orca API · ${group.connection.baseUrl}`,
                api:
                  group.connection.protocol === 'google-genai'
                    ? 'google-generative-ai'
                    : group.connection.protocol,
                baseURL: group.connection.baseUrl,
                apiKeyEnv: connections.length ? group.keyEnv : 'ORCA_MODEL_API_KEY',
                models: group.models.map((model) => ({
                  id: model.model,
                  name:
                    groups.filter((entry) =>
                      entry.models.some((item) => item.model === model.model)
                    ).length > 1
                      ? `${model.model} · ${group.connection.baseUrl}`
                      : model.model,
                  contextWindow: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW,
                  reasoningEfforts: {
                    off: null,
                    low: 'low',
                    medium: 'medium',
                    high: 'high'
                  }
                })),
                ...(group.connection.baseUrl.includes('api.deepseek.com')
                  ? { compat: { thinkingFormat: 'deepseek' } }
                  : {})
              }
            ])
          )
        }
      },
      { id: 'acp', config: { provider: providerId(active), model: active.model } }
    ],
    null,
    2
  )
}
