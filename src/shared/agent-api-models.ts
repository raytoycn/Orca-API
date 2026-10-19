import { z } from 'zod'
import { AgentApiConnection } from './agent-api-connection-schema'

export const AgentApiModelsRequest = AgentApiConnection.omit({
  model: true,
  contextWindow: true
}).extend({
  apiKey: AgentApiConnection.shape.apiKey.optional(),
  presetId: AgentApiConnection.shape.model.optional()
})
export type AgentApiModelsRequest = typeof AgentApiModelsRequest._output
export const AgentApiModelSchema = z
  .object({
    id: z.string().min(1).max(1024),
    name: z.string().min(1).max(1024),
    contextWindow: z.number().int().min(1024).max(20000000).optional()
  })
  .strict()
export const AgentApiModelCatalog = z.array(AgentApiModelSchema).max(2000)
export type AgentApiModel = z.infer<typeof AgentApiModelSchema>
