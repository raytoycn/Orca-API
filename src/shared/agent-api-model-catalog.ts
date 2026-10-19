import type { AgentApiConnection } from './agent-api-connection-schema'
import type { AgentApiPreset } from './agent-api-presets'
import type { AgentSessionOptionsResult } from './agent-session-wire'

export const API_MODEL_KEY_PREFIX = 'ORCA_API_MODEL_KEY_'

export function agentApiCatalogConnections(
  active: AgentApiConnection,
  presets: readonly AgentApiPreset[] = []
): AgentApiConnection[] {
  const seen = new Set<string>()
  const catalog = presets.flatMap((preset) =>
    preset.models?.length
      ? preset.models.map((model) => ({
          ...preset.connection,
          model: model.id,
          contextWindow: model.contextWindow ?? preset.connection.contextWindow
        }))
      : [preset.connection]
  )
  return [active, ...catalog].filter((connection) => {
    if (connection.agent !== active.agent) {
      return false
    }
    const identity = JSON.stringify(connection)
    if (seen.has(identity)) {
      return false
    }
    seen.add(identity)
    return true
  })
}

export function agentApiCatalogGroups(
  active: AgentApiConnection,
  connections: readonly AgentApiConnection[] = []
) {
  const groups: {
    id: string
    keyEnv: string
    connection: AgentApiConnection
    models: AgentApiConnection[]
  }[] = []
  for (const connection of [active, ...connections]) {
    if (connection.agent !== active.agent) {
      continue
    }
    const group = groups.find(
      (entry) =>
        entry.connection.baseUrl === connection.baseUrl &&
        entry.connection.protocol === connection.protocol &&
        entry.connection.apiKey === connection.apiKey &&
        entry.connection.credentialType === connection.credentialType
    )
    if (group) {
      if (!group.models.some((model) => model.model === connection.model)) {
        group.models.push(connection)
      }
    } else {
      groups.push({
        id: groups.length === 0 ? 'orca-api' : `orca-api-${groups.length}`,
        keyEnv: `${API_MODEL_KEY_PREFIX}${groups.length}`,
        connection,
        models: [connection]
      })
    }
  }
  return groups
}

export function agentApiCatalogCredentials(
  active: AgentApiConnection,
  connections: readonly AgentApiConnection[] = []
): Record<string, string> {
  return Object.fromEntries(
    agentApiCatalogGroups(active, connections).map((group) => [
      group.keyEnv,
      group.connection.apiKey
    ])
  )
}

export function includeConfiguredApiModelsInSessionOptions(
  agent: string,
  result: AgentSessionOptionsResult,
  presets: readonly AgentApiPreset[]
): AgentSessionOptionsResult {
  const configured = presets
    .filter((preset) => preset.connection.agent === agent)
    .flatMap((preset) =>
      (preset.models?.length
        ? preset.models
        : [{ id: preset.connection.model, name: preset.connection.model }]
      ).map((model) => ({
        id: model.id,
        label: `${model.name} · ${preset.name}`,
        isDefault: false,
        efforts: []
      }))
    )
  if (configured.length === 0) {
    return result
  }
  const byId = new Map(result.models.map((model) => [model.id, model]))
  for (const model of configured) {
    if (!byId.has(model.id)) {
      byId.set(model.id, model)
    }
  }
  return { ...result, models: [...byId.values()] }
}
