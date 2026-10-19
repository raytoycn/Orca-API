import { AgentApiConnection } from '../../shared/agent-api-connection'
import { AGENT_API_PROTOCOLS } from '../../shared/agent-api-connection-schema'
import { AgentApiPresetDraft, type AgentApiPreset } from '../../shared/agent-api-presets'
import type {
  AgentLaunchSettingsMutation,
  AgentLaunchSettingsSource
} from '../../shared/agent-launch-settings'

export function resolveAgentApiPresetMutation(
  settings: AgentLaunchSettingsSource,
  mutation: AgentLaunchSettingsMutation
): {
  mutation: AgentLaunchSettingsMutation
  updates: Partial<AgentLaunchSettingsSource>
} {
  if (mutation.type === 'api-preset-models') {
    const saved = settings.agentApiPresets?.find(
      (preset) => preset.id === mutation.id && preset.connection.agent === mutation.agent
    )
    if (
      !saved ||
      JSON.stringify(saved.connection) !== JSON.stringify(mutation.expectedConnection)
    ) {
      throw new Error('API configuration changed; retry the operation')
    }
    const presets = (settings.agentApiPresets ?? []).map((preset) =>
      preset === saved ? { ...preset, models: mutation.models } : preset
    )
    const active = presets.find(
      (preset) => preset.id === settings.activeAgentApiPresets?.[mutation.agent]
    )
    const activeOrcaAgent = presets.find(
      (preset) =>
        preset.id === settings.activeAgentApiPresets?.['orca-agent'] &&
        preset.connection.agent === 'orca-agent'
    )
    return {
      mutation: activeOrcaAgent
        ? ({
            type: 'api-set',
            connection: activeOrcaAgent.connection
          } satisfies AgentLaunchSettingsMutation)
        : active
          ? ({
              type: 'api-set',
              connection: active.connection
            } satisfies AgentLaunchSettingsMutation)
          : mutation,
      updates: { agentApiPresets: presets }
    }
  }
  if (
    mutation.type === 'api-preset-delete' &&
    settings.activeAgentApiPresets?.[mutation.agent] !== mutation.id
  ) {
    const active = settings.agentApiPresets?.find(
      (entry) => entry.id === settings.activeAgentApiPresets?.[mutation.agent]
    )
    if (active) {
      return {
        mutation: {
          type: 'api-set',
          connection: active.connection
        } satisfies AgentLaunchSettingsMutation,
        updates: {
          agentApiPresets: (settings.agentApiPresets ?? []).filter(
            (entry) => entry.id !== mutation.id || entry.connection.agent !== mutation.agent
          )
        }
      }
    }
  }
  if (
    mutation.type === 'api-preset-delete' &&
    settings.activeAgentApiPresets?.[mutation.agent] === mutation.id
  ) {
    return {
      mutation: { type: 'api-clear', agent: mutation.agent } satisfies AgentLaunchSettingsMutation,
      updates: {
        agentApiPresets: (settings.agentApiPresets ?? []).filter(
          (entry) => entry.id !== mutation.id || entry.connection.agent !== mutation.agent
        )
      }
    }
  }
  if (mutation.type !== 'api-preset-save' && mutation.type !== 'api-preset-activate') {
    return { mutation, updates: {} }
  }
  const id = mutation.type === 'api-preset-save' ? mutation.preset.id : mutation.id
  const saved = settings.agentApiPresets?.find((entry) => entry.id === id)
  const draft =
    mutation.type === 'api-preset-save' ? AgentApiPresetDraft.parse(mutation.preset) : null
  const agent =
    draft?.connection.agent ??
    (mutation.type === 'api-preset-activate' ? mutation.agent : undefined)
  if (
    saved &&
    saved.connection.agent !== agent &&
    !(
      mutation.type === 'api-preset-activate' &&
      agent === 'orca-agent' &&
      AGENT_API_PROTOCOLS['orca-agent'].includes(saved.connection.protocol)
    )
  ) {
    throw new Error('API preset agent mismatch')
  }
  if (
    saved &&
    saved.connection.agent !== 'orca-agent' &&
    agent === 'orca-agent' &&
    mutation.type === 'api-preset-activate'
  ) {
    const existingOrcaPreset = settings.agentApiPresets?.find(
      (preset) =>
        preset.connection.agent === 'orca-agent' &&
        preset.connection.baseUrl === saved.connection.baseUrl &&
        preset.connection.protocol === saved.connection.protocol &&
        preset.connection.credentialType === saved.connection.credentialType &&
        preset.connection.apiKey === saved.connection.apiKey
    )
    if (existingOrcaPreset) {
      return {
        mutation: {
          type: 'api-preset-activate',
          agent: 'orca-agent',
          id: existingOrcaPreset.id,
          ...(mutation.model ? { model: mutation.model } : {}),
          ...(mutation.contextWindow ? { contextWindow: mutation.contextWindow } : {})
        } satisfies AgentLaunchSettingsMutation,
        updates: {
          activeAgentApiPresets: {
            ...settings.activeAgentApiPresets,
            'orca-agent': existingOrcaPreset.id
          }
        }
      }
    }
    const bridgedConnection = AgentApiConnection.parse({
      ...saved.connection,
      agent: 'orca-agent',
      ...(mutation.model ? { model: mutation.model } : {}),
      ...(mutation.contextWindow ? { contextWindow: mutation.contextWindow } : {})
    })
    const bridgedId = `${saved.id}:orca-bridge`
    const bridgedPreset: AgentApiPreset = {
      id: bridgedId,
      name: `${saved.name} · ${saved.connection.agent}`,
      connection: bridgedConnection,
      ...(saved.models ? { models: saved.models } : {})
    }
    return {
      mutation: { type: 'api-set', connection: bridgedConnection },
      updates: {
        agentApiPresets: [
          ...(settings.agentApiPresets ?? []).filter((entry) => entry.id !== bridgedId),
          bridgedPreset
        ],
        activeAgentApiPresets: {
          ...settings.activeAgentApiPresets,
          'orca-agent': bridgedId
        }
      }
    }
  }
  const connection = AgentApiConnection.parse(
    draft
      ? { ...draft.connection, apiKey: draft.connection.apiKey || saved?.connection.apiKey }
      : saved
        ? {
            ...saved.connection,
            ...(mutation.type === 'api-preset-activate' && mutation.model
              ? { model: mutation.model }
              : {}),
            ...(mutation.type === 'api-preset-activate' && mutation.contextWindow
              ? { contextWindow: mutation.contextWindow }
              : {})
          }
        : undefined
  )
  if (
    draft &&
    !draft.connection.apiKey &&
    saved &&
    (draft.connection.baseUrl !== saved.connection.baseUrl ||
      draft.connection.protocol !== saved.connection.protocol ||
      draft.connection.credentialType !== saved.connection.credentialType)
  ) {
    throw new Error('Enter the API key for the changed endpoint')
  }
  const preset = {
    id,
    name: draft?.name ?? saved?.name ?? connection.model,
    connection,
    ...((draft?.models ?? saved?.models) ? { models: draft?.models ?? saved?.models } : {})
  }
  if (!saved && (settings.agentApiPresets?.length ?? 0) >= 256) {
    throw new Error('API preset limit reached')
  }
  return {
    mutation: { type: 'api-set', connection } satisfies AgentLaunchSettingsMutation,
    updates: {
      agentApiPresets: [
        ...(settings.agentApiPresets ?? []).filter((entry) => entry.id !== id),
        preset
      ],
      activeAgentApiPresets: { ...settings.activeAgentApiPresets, [connection.agent]: id }
    }
  }
}
