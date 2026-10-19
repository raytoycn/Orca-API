import type { OrcaRuntimeService } from '../runtime/orca-runtime'

export async function refreshAgentApiCatalogs(runtime: OrcaRuntimeService): Promise<void> {
  const settings = runtime.getClientAgentLaunchSettings()
  for (const preset of settings.apiPresets ?? []) {
    if (settings.activeApiPresets?.[preset.connection.agent] !== preset.id) {
      continue
    }
    try {
      await runtime.mutateClientAgentLaunchSettings({
        type: 'api-preset-activate',
        agent: preset.connection.agent,
        id: preset.id
      })
    } catch {
      console.warn(
        `[agent-api] Could not refresh ${preset.connection.agent} model catalog; existing configuration retained`
      )
    }
  }
}
