import type { AgentApiConnection } from './agent-api-connection-schema'
import { AGENT_API_PROTOCOLS } from './agent-api-connection-schema'
import { orcaAgentModelId, orcaAgentProviderId } from './orca-agent-model-id'
import { agentApiPresetDisplayName } from './agent-api-presets'
import type { AgentApiPreset, AgentApiPresetSummary } from './agent-api-presets'
import type { AgentApiModel } from './agent-api-models'
import type { AgentSessionOptionsResult } from './agent-session-wire'

export const API_MODEL_KEY_PREFIX = 'ORCA_API_MODEL_KEY_'

const ORCA_AGENT_EFFORTS = [
  { value: 'off', label: 'off' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' }
]

export function agentApiCatalogConnections(
  active: AgentApiConnection,
  presets: readonly AgentApiPreset[] = []
): AgentApiConnection[] {
  const seen = new Set<string>()
  const catalog = presets.flatMap((preset) => {
    const connection = orcaAgentBridgeConnection(active, preset.connection)
    if (!connection) {
      return []
    }
    return preset.models?.length
      ? preset.models.map((model) => ({
          ...connection,
          model: model.id,
          contextWindow: model.contextWindow ?? connection.contextWindow
        }))
      : [connection]
  })
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

function orcaAgentBridgeConnection(
  active: AgentApiConnection,
  connection: AgentApiConnection
): AgentApiConnection | null {
  if (connection.agent === active.agent) {
    return connection
  }
  if (active.agent !== 'orca-agent') {
    return null
  }
  return AGENT_API_PROTOCOLS['orca-agent'].includes(connection.protocol)
    ? { ...connection, agent: 'orca-agent' }
    : null
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
  presets: readonly (AgentApiPreset | AgentApiPresetSummary)[]
): AgentSessionOptionsResult {
  const configured = presets
    .filter((preset) => {
      if (preset.connection.agent === agent) {
        return true
      }
      return (
        agent === 'orca-agent' &&
        AGENT_API_PROTOCOLS['orca-agent'].includes(preset.connection.protocol)
      )
    })
    .flatMap((preset) =>
      (preset.models?.length
        ? preset.models
        : [{ id: preset.connection.model, name: preset.connection.model }]
      ).map((model) => ({
        id:
          agent === 'orca-agent'
            ? orcaAgentModelId(
                'modelProviderId' in preset && preset.modelProviderId
                  ? preset.modelProviderId
                  : orcaAgentProviderId({
                      ...preset.connection,
                      apiKey: 'apiKey' in preset.connection ? preset.connection.apiKey : ''
                    }),
                model.id
              )
            : model.id,
        label: model.name,
        provider: { id: preset.id, label: agentApiPresetDisplayName(preset) },
        isDefault: false,
        efforts: []
      }))
    )
  if (configured.length === 0) {
    return result
  }
  const byId = new Map(result.models.map((model) => [model.id, model]))
  for (const model of configured) {
    const existing = byId.get(model.id)
    const merged = { ...model, ...existing, label: model.label, provider: model.provider }
    if (agent === 'orca-agent' && merged.efforts.length === 0) {
      merged.efforts = ORCA_AGENT_EFFORTS
    }
    byId.set(model.id, merged)
  }
  return { ...result, models: [...byId.values()] }
}

export function isOrcaAgentBridgeableApiPreset(
  preset: Pick<AgentApiPreset, 'connection'> | Pick<AgentApiPresetSummary, 'connection'>
): boolean {
  return (
    preset.connection.agent === 'orca-agent' ||
    AGENT_API_PROTOCOLS['orca-agent'].includes(preset.connection.protocol)
  )
}

export function uniqueOrcaAgentApiPresets(
  presets: readonly AgentApiPresetSummary[]
): AgentApiPresetSummary[] {
  const groups = new Map<string, AgentApiPresetSummary>()
  for (const preset of presets) {
    const key = preset.modelProviderId ?? JSON.stringify(preset.connection)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { ...preset, models: preset.models ?? [] })
      continue
    }
    const representative = chooseOrcaAgentPresetRepresentative(existing, preset)
    groups.set(key, {
      ...representative,
      models: mergeAgentApiModels(existing.models ?? [], preset.models ?? [])
    })
  }
  return [...groups.values()]
}

function chooseOrcaAgentPresetRepresentative(
  left: AgentApiPresetSummary,
  right: AgentApiPresetSummary
): AgentApiPresetSummary {
  if (left.connection.agent === 'orca-agent' && right.connection.agent !== 'orca-agent') {
    return left
  }
  if (right.connection.agent === 'orca-agent' && left.connection.agent !== 'orca-agent') {
    return right
  }
  if ((left.models?.length ?? 0) !== (right.models?.length ?? 0)) {
    return (left.models?.length ?? 0) > (right.models?.length ?? 0) ? left : right
  }
  return isDescriptivePresetName(left) ? left : right
}

function isDescriptivePresetName(preset: AgentApiPresetSummary): boolean {
  try {
    return preset.name !== new URL(preset.connection.baseUrl).host
  } catch {
    return true
  }
}

function mergeAgentApiModels(
  left: readonly AgentApiModel[],
  right: readonly AgentApiModel[]
): AgentApiModel[] {
  const merged = new Map<string, AgentApiModel>()
  for (const model of [...left, ...right]) {
    const existing = merged.get(model.id)
    merged.set(
      model.id,
      existing
        ? { ...existing, ...model, contextWindow: model.contextWindow ?? existing.contextWindow }
        : model
    )
  }
  return [...merged.values()]
}
