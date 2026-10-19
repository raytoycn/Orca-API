import { AgentApiConnection } from '../../shared/agent-api-connection'
import { AgentApiPresetDraft } from '../../shared/agent-api-presets'
import type {
  AgentLaunchSettingsMutation,
  AgentLaunchSettingsSource
} from '../../shared/agent-launch-settings'

export function resolveAgentApiPresetMutation(
  settings: AgentLaunchSettingsSource,
  mutation: AgentLaunchSettingsMutation
) {
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
  if (saved && saved.connection.agent !== agent) {
    throw new Error('API preset agent mismatch')
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
