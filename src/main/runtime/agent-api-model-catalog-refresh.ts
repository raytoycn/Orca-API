import type { AgentApiModelsRequest } from '../../shared/agent-api-models'
import type { AgentLaunchSettingsMutation } from '../../shared/agent-launch-settings'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { discoverSavedAgentApiModels } from './agent-api-model-discovery'

export async function listAndCacheAgentApiModels(
  request: AgentApiModelsRequest,
  readSettings: () => Pick<GlobalSettings, 'agentApiPresets'> | undefined,
  mutate: (mutation: AgentLaunchSettingsMutation) => Promise<unknown>
) {
  const saved = readSettings()?.agentApiPresets?.find((preset) => preset.id === request.presetId)
  const models = await discoverSavedAgentApiModels(readSettings()?.agentApiPresets ?? [], request)
  const current = readSettings()?.agentApiPresets?.find((preset) => preset.id === request.presetId)
  if (
    saved &&
    current &&
    (!request.apiKey || request.apiKey === saved.connection.apiKey) &&
    JSON.stringify(saved.connection) === JSON.stringify(current.connection) &&
    saved.connection.agent === request.agent &&
    saved.connection.baseUrl === request.baseUrl &&
    saved.connection.protocol === request.protocol &&
    saved.connection.credentialType === request.credentialType &&
    JSON.stringify(current.models) !== JSON.stringify(models)
  ) {
    await mutate({
      type: 'api-preset-models',
      agent: request.agent,
      id: saved.id,
      expectedConnection: saved.connection,
      models
    })
  }
  return models
}
