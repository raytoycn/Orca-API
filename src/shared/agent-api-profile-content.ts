import type { AgentApiConnection } from './agent-api-connection'
import { DEFAULT_API_CONTEXT_WINDOW } from './agent-api-presets'
import { agentApiCatalogGroups } from './agent-api-model-catalog'
import { orcaAgentProfileContent } from './orca-agent-profile'
import { codexApiModelCatalog } from './codex-api-model-catalog'

export function agentApiProfileContent(
  input: AgentApiConnection,
  connections: readonly AgentApiConnection[] = []
): {
  variable: string
  content: string
  filename?: string
  directory?: boolean
  extraFiles?: Record<string, string>
  argumentFlag?: string
} | null {
  if (input.protocol === 'agent-service') {
    return null
  }
  if (input.agent === 'orca-agent') {
    return {
      variable: 'ORCA_HARNESS_PATCH',
      filename: 'cordis.patch.yml',
      content: orcaAgentProfileContent(input, connections)
    }
  }
  if (input.agent === 'codex') {
    return {
      variable: 'ORCA_CODEX_MODEL_CATALOG',
      filename: 'models.json',
      content: JSON.stringify(codexApiModelCatalog(input, connections))
    }
  }
  if (input.agent === 'pi') {
    return {
      variable: 'PI_CODING_AGENT_DIR',
      directory: true,
      filename: 'models.json',
      content: JSON.stringify({
        providers: Object.fromEntries(
          agentApiCatalogGroups(input, connections).map((group) => [
            group.id,
            {
              baseUrl: group.connection.baseUrl,
              api:
                group.connection.protocol === 'google-genai'
                  ? 'google-generative-ai'
                  : group.connection.protocol,
              apiKey: connections.length ? `\${${group.keyEnv}}` : '${ORCA_MODEL_API_KEY}',
              models: group.models.map((model) => ({
                id: model.model,
                contextWindow: model.contextWindow ?? DEFAULT_API_CONTEXT_WINDOW
              }))
            }
          ])
        )
      }),
      extraFiles: {
        'settings.json': JSON.stringify({ defaultProvider: 'orca-api', defaultModel: input.model })
      }
    }
  }
  if (input.agent === 'gemini') {
    return {
      variable: 'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
      content: JSON.stringify({
        security: { auth: { selectedType: 'gemini-api-key' } },
        model: { name: input.model }
      })
    }
  }
  if (input.agent === 'qwen-code') {
    return {
      variable: 'QWEN_CODE_SYSTEM_SETTINGS_PATH',
      content: JSON.stringify({
        security: { auth: { selectedType: 'openai' } },
        model: { name: input.model, baseUrl: input.baseUrl },
        modelProviders: {
          openai: agentApiCatalogGroups(input, connections).flatMap((group) =>
            group.models.map((model) => ({
              id: model.model,
              baseUrl: model.baseUrl,
              envKey: connections.length ? group.keyEnv : 'OPENAI_API_KEY'
            }))
          )
        }
      })
    }
  }
  return null
}
