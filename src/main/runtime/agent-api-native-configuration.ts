import type { AgentApiConnection } from '../../shared/agent-api-connection'
import type { AgentLaunchSettingsMutation } from '../../shared/agent-launch-settings'
import { applyHermesApiConfiguration } from './hermes-api-configuration'
import { applyKimiApiConfiguration } from './kimi-api-configuration'

export function applyAgentApiNativeConfiguration(
  mutation: AgentLaunchSettingsMutation,
  env: Record<string, string>,
  userData: string,
  connections: readonly AgentApiConnection[]
) {
  return (
    applyKimiApiConfiguration(mutation, env, userData, connections) ??
    applyHermesApiConfiguration(mutation, env, userData, process.env, connections)
  )
}
