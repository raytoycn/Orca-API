import { z } from 'zod'
import { AgentApiConnection } from './agent-api-connection-schema'
import { AgentApiModelCatalog, type AgentApiModel } from './agent-api-models'

export const DEFAULT_API_CONTEXT_WINDOW = 1000000
export const AgentApiPresetDraft = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(128),
    connection: AgentApiConnection.extend({ apiKey: z.string().max(8192).optional() }),
    models: AgentApiModelCatalog.optional()
  })
  .strict()
export type AgentApiPreset = {
  id: string
  name: string
  connection: z.infer<typeof AgentApiConnection>
  models?: AgentApiModel[]
}
export type AgentApiPresetSummary = Omit<AgentApiPreset, 'connection'> & {
  connection: Omit<AgentApiPreset['connection'], 'apiKey'>
}
export type AgentApiPresetDraft = z.infer<typeof AgentApiPresetDraft>

export function summarizeAgentApiPresets(
  presets: readonly AgentApiPreset[]
): AgentApiPresetSummary[] {
  return presets.map(({ id, name, models, connection: { apiKey: _apiKey, ...connection } }) => ({
    id,
    name,
    connection,
    ...(models ? { models } : {})
  }))
}

export function agentApiPresetDisplayName(
  preset: Pick<AgentApiPresetSummary, 'name' | 'connection'>
): string {
  let host = preset.connection.baseUrl
  try {
    host = new URL(preset.connection.baseUrl).host
  } catch {
    // Keep the saved endpoint visible while the user repairs an invalid URL.
  }
  if (preset.name === host) {
    return host
  }
  if (preset.name === preset.connection.model) {
    return `${host} · ${preset.name}`
  }
  return `${preset.name} · ${host}`
}
