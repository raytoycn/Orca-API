import type { AgentApiConnection } from './agent-api-connection-schema'
import { agentApiCatalogGroups } from './agent-api-model-catalog'
import { DEFAULT_API_CONTEXT_WINDOW } from './agent-api-presets'

export function codexApiModelCatalog(
  connection: AgentApiConnection,
  connections: readonly AgentApiConnection[]
) {
  return {
    models: agentApiCatalogGroups(connection, connections)[0].models.map((model, priority) => ({
      slug: model.model,
      display_name: model.model,
      description: model.model,
      base_instructions: 'You are a coding agent working with the user on their project.',
      default_reasoning_level: 'none',
      supported_reasoning_levels: [{ effort: 'none', description: 'Default' }],
      shell_type: 'shell_command',
      visibility: 'list',
      supported_in_api: true,
      priority,
      supports_reasoning_summaries: false,
      default_reasoning_summary: 'none',
      support_verbosity: false,
      truncation_policy: { mode: 'bytes', limit: 10000 },
      supports_parallel_tool_calls: false,
      supports_image_detail_original: false,
      context_window: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW,
      max_context_window: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW,
      effective_context_window_percent: 95,
      experimental_supported_tools: [],
      input_modalities: ['text'],
      supports_search_tool: false
    }))
  }
}
