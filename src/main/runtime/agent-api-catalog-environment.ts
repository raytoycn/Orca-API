import {
  agentApiCatalogConnections,
  agentApiCatalogCredentials
} from '../../shared/agent-api-model-catalog'
import type {
  AgentLaunchSettingsSource,
  AgentLaunchSettingsMutation
} from '../../shared/agent-launch-settings'
import { resolveAgentApiPresetMutation } from './agent-api-preset-mutation'
import type { AgentApiConnection } from '../../shared/agent-api-connection'
import { prepareAgentApiProfile } from './agent-api-profile'

export async function prepareAgentApiCatalogEnvironment(
  connection: AgentApiConnection,
  userData: string,
  connections: readonly AgentApiConnection[]
) {
  const credentials = agentApiCatalogCredentials(connection, connections)
  if (connection.agent === 'hermes') {
    return credentials
  }
  if (connection.agent === 'kimi') {
    return {
      ...credentials,
      ORCA_KIMI_NATIVE_API: '1',
      KIMI_MODEL_NAME: '',
      KIMI_MODEL_API_KEY: '',
      KIMI_MODEL_BASE_URL: '',
      KIMI_MODEL_PROVIDER_TYPE: '',
      KIMI_MODEL_MAX_CONTEXT_SIZE: '',
      KIMI_MODEL_CAPABILITIES: ''
    }
  }
  return prepareAgentApiProfile(connection, userData, connections)
}

export async function prepareAgentApiMutationEnvironment(
  settings: AgentLaunchSettingsSource,
  mutation: AgentLaunchSettingsMutation,
  userData: string
) {
  const resolved = resolveAgentApiPresetMutation(settings, mutation)
  const applied = resolved.mutation
  const connections =
    applied.type === 'api-set'
      ? agentApiCatalogConnections(
          applied.connection,
          resolved.updates.agentApiPresets ?? settings.agentApiPresets
        )
      : []
  const profileEnvironment =
    applied.type === 'api-set'
      ? await prepareAgentApiCatalogEnvironment(applied.connection, userData, connections)
      : {}
  return { resolved, connections, profileEnvironment }
}

export function verifyPreparedAgentApiMutation(
  settings: AgentLaunchSettingsSource,
  original: AgentLaunchSettingsMutation,
  prepared: AgentLaunchSettingsMutation,
  connections: readonly AgentApiConnection[]
) {
  const current = resolveAgentApiPresetMutation(settings, original)
  if (
    JSON.stringify(current.mutation) !== JSON.stringify(prepared) ||
    (prepared.type === 'api-set' &&
      JSON.stringify(
        agentApiCatalogConnections(
          prepared.connection,
          current.updates.agentApiPresets ?? settings.agentApiPresets
        )
      ) !== JSON.stringify(connections))
  ) {
    throw new Error('API configuration changed; retry the operation')
  }
  return current
}
