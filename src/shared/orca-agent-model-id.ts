import type { AgentApiConnection } from './agent-api-connection-schema'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

export function orcaAgentProviderId(connection: AgentApiConnection): string {
  const identity = JSON.stringify([
    connection.baseUrl,
    connection.protocol,
    connection.credentialType,
    connection.apiKey
  ])
  return `orca-${bytesToHex(sha256(identity))}`
}

export function orcaAgentModelId(provider: string, model: string): string {
  return JSON.stringify([provider, model])
}
