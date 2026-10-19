import type { AgentApiConnection } from '../../shared/agent-api-connection'
import { agentApiCatalogCredentials } from '../../shared/agent-api-model-catalog'
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
