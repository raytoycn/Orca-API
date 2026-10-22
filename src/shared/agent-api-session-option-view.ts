import type { AgentType } from './agent-status-types'
import type { AgentApiPresetSummary } from './agent-api-presets'
import type { AgentChatPermissionMode } from './agent-chat-permission-mode'
import type { StructuredAgentSessionOptionState } from './structured-agent-session-options'
import {
  includeConfiguredApiModelsInSessionOptions,
  isOrcaAgentBridgeableApiPreset
} from './agent-api-model-catalog'

export function configuredAgentApiOptionView(
  agent: AgentType,
  view: StructuredAgentSessionOptionState,
  presets: readonly AgentApiPresetSummary[],
  defaultPermissionMode: AgentChatPermissionMode | undefined
): StructuredAgentSessionOptionState {
  if (
    !presets.some((preset) =>
      agent === 'orca-agent'
        ? isOrcaAgentBridgeableApiPreset(preset)
        : preset.connection.agent === agent
    )
  ) {
    return view
  }
  const merged = includeConfiguredApiModelsInSessionOptions(
    agent,
    {
      models: (view.catalog?.models ?? []).map((model) => {
        const effort = model.options.find((entry) => entry.id === 'effort')
        return {
          id: model.id,
          label: model.label,
          ...(model.provider ? { provider: model.provider } : {}),
          isDefault: model.isDefault === true,
          efforts: effort?.kind.type === 'select' ? effort.kind.choices : []
        }
      }),
      current: {}
    },
    presets
  )
  if (!merged.models.length) {
    return view
  }
  const existing = new Map(view.catalog?.models.map((model) => [model.id, model]) ?? [])
  return {
    ...view,
    catalog: {
      ...(view.catalog ?? { modelApply: {} }),
      models: merged.models.map((model) => ({
        ...(existing.get(model.id) ?? { id: model.id, options: [] }),
        label: model.label,
        ...(model.provider ? { provider: model.provider } : {})
      }))
    },
    catalogSource:
      view.catalogSource === 'seed' || view.catalogSource === null ? 'host' : view.catalogSource,
    permissionMode:
      view.permissionMode ?? (agent === 'orca-agent' ? (defaultPermissionMode ?? 'ask') : null)
  }
}
