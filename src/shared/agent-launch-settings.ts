import type { GlobalSettings } from './global-settings-types'
import { agentApiCatalogConnections } from './agent-api-model-catalog'
import {
  summarizeAgentApiPresets,
  type AgentApiPresetSummary,
  type AgentApiPresetDraft
} from './agent-api-presets'
import {
  API_CONFIGURATION_AGENTS,
  configureAgentApiEnvironment,
  clearAgentApiEnvironment,
  isAgentApiEnvironmentName,
  type AgentApiConnection,
  type AgentApiAgent
} from './agent-api-connection'
import type { TuiAgent } from './tui-agent'
import { buildDefaultAgentSettingsUpdate } from './default-agent-settings'
import {
  buildAgentAvailabilitySettingsUpdate,
  normalizeDisabledTuiAgents
} from './tui-agent-selection'
import { normalizeTuiAgentArgsRecord, resolveTuiAgentLaunchEnv } from './tui-agent-launch-defaults'
import {
  applyAgentPermissionMode,
  resolveAgentPermissionModeSummary,
  type AgentPermissionMode
} from './tui-agent-permissions'

export type AgentLaunchSettingsSource = Partial<
  Pick<
    GlobalSettings,
    | 'defaultTuiAgent'
    | 'newWorkspaceSetupOnly'
    | 'disabledTuiAgents'
    | 'agentCmdOverrides'
    | 'agentDefaultArgs'
    | 'agentDefaultEnv'
    | 'agentApiPresets'
    | 'activeAgentApiPresets'
  >
>

export type AgentLaunchSettings = {
  apiPresets?: AgentApiPresetSummary[]
  activeApiPresets?: Partial<Record<TuiAgent, string>>
  apiConfigurationAgents?: AgentApiAgent[]
  defaultTuiAgent: GlobalSettings['defaultTuiAgent']
  newWorkspaceSetupOnly?: boolean
  disabledTuiAgents: TuiAgent[]
  agentCmdOverrides: NonNullable<GlobalSettings['agentCmdOverrides']>
  agentDefaultArgs: NonNullable<GlobalSettings['agentDefaultArgs']>
  environmentNames: Partial<Record<TuiAgent, string[]>>
  permissionMode: AgentPermissionMode
}

export type AgentLaunchSettingsMutation =
  | { type: 'api-preset-save'; preset: AgentApiPresetDraft }
  | {
      type: 'api-preset-activate'
      agent: AgentApiAgent
      id: string
      model?: string
      contextWindow?: number
    }
  | { type: 'api-preset-delete'; agent: AgentApiAgent; id: string }
  | { type: 'api-set'; connection: AgentApiConnection }
  | { type: 'api-clear'; agent: AgentApiAgent }
  | { type: 'default'; agent: GlobalSettings['defaultTuiAgent']; setupOnly?: boolean }
  | { type: 'availability'; agent: TuiAgent; enabled: boolean }
  | { type: 'permissions'; mode: Exclude<AgentPermissionMode, 'mixed'> }
  | { type: 'command'; agent: TuiAgent; value: string }
  | { type: 'arguments'; agent: TuiAgent; value: string }
  | { type: 'environment-set'; agent: TuiAgent; name: string; value: string }
  | { type: 'environment-remove'; agent: TuiAgent; name: string }

export function projectAgentLaunchSettings(
  settings: AgentLaunchSettingsSource
): AgentLaunchSettings {
  return {
    apiPresets: summarizeAgentApiPresets(settings.agentApiPresets ?? []),
    activeApiPresets: { ...settings.activeAgentApiPresets },
    apiConfigurationAgents: [...API_CONFIGURATION_AGENTS],
    defaultTuiAgent: settings.defaultTuiAgent ?? null,
    newWorkspaceSetupOnly: false,
    disabledTuiAgents: normalizeDisabledTuiAgents(settings.disabledTuiAgents),
    agentCmdOverrides: { ...settings.agentCmdOverrides },
    agentDefaultArgs: normalizeTuiAgentArgsRecord(settings.agentDefaultArgs),
    environmentNames: Object.fromEntries(
      Object.entries(settings.agentDefaultEnv ?? {}).map(([agent, env]) => [
        agent,
        Object.keys(env ?? {})
          .filter((name) => !isAgentApiEnvironmentName(agent, name))
          .sort()
      ])
    ),
    permissionMode: resolveAgentPermissionModeSummary(settings)
  }
}

export function agentLaunchSettingsMutationUpdates(
  settings: AgentLaunchSettingsSource,
  mutation: AgentLaunchSettingsMutation,
  platform: NodeJS.Platform
): AgentLaunchSettingsSource {
  switch (mutation.type) {
    case 'api-preset-save':
    case 'api-preset-activate':
      throw new Error('API presets must be applied by the execution host')
    case 'api-preset-delete': {
      const active = settings.activeAgentApiPresets?.[mutation.agent] === mutation.id
      const activeAgentApiPresets = { ...settings.activeAgentApiPresets }
      if (active) {
        delete activeAgentApiPresets[mutation.agent]
      }
      return {
        agentApiPresets: (settings.agentApiPresets ?? []).filter(
          (preset) => preset.id !== mutation.id || preset.connection.agent !== mutation.agent
        ),
        activeAgentApiPresets,
        ...(active
          ? agentLaunchSettingsMutationUpdates(
              settings,
              { type: 'api-clear', agent: mutation.agent },
              platform
            )
          : {})
      }
    }
    case 'api-set': {
      const agent = mutation.connection.agent
      const env = resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv)
      return {
        agentDefaultEnv: {
          ...settings.agentDefaultEnv,
          [agent]: configureAgentApiEnvironment(
            env,
            mutation.connection,
            agentApiCatalogConnections(mutation.connection, settings.agentApiPresets)
          )
        }
      }
    }
    case 'api-clear': {
      const agent = mutation.agent
      const env = resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv)
      return {
        activeAgentApiPresets: { ...settings.activeAgentApiPresets, [agent]: undefined },
        agentDefaultEnv: {
          ...settings.agentDefaultEnv,
          [agent]: clearAgentApiEnvironment(env, agent)
        }
      }
    }
    case 'default':
      return buildDefaultAgentSettingsUpdate(mutation.agent)
    case 'availability':
      return buildAgentAvailabilitySettingsUpdate(
        {
          defaultTuiAgent: settings.defaultTuiAgent ?? null,
          disabledTuiAgents: settings.disabledTuiAgents ?? []
        },
        mutation.agent,
        mutation.enabled
      )
    case 'permissions':
      return applyAgentPermissionMode({ ...settings, mode: mutation.mode })
    case 'command': {
      const commands = { ...settings.agentCmdOverrides }
      if (mutation.value.trim()) {
        commands[mutation.agent] = mutation.value.trim()
      } else {
        delete commands[mutation.agent]
      }
      return { agentCmdOverrides: commands }
    }
    case 'arguments':
      return {
        agentDefaultArgs: normalizeTuiAgentArgsRecord({
          ...settings.agentDefaultArgs,
          [mutation.agent]: mutation.value
        })
      }
    case 'environment-set':
    case 'environment-remove': {
      const env = { ...resolveTuiAgentLaunchEnv(mutation.agent, settings.agentDefaultEnv) }
      // Windows environment names are case insensitive on the execution host.
      for (const name of Object.keys(env)) {
        if (
          name === mutation.name ||
          (platform === 'win32' && name.toLowerCase() === mutation.name.toLowerCase())
        ) {
          delete env[name]
        }
      }
      const nextEnv =
        mutation.type === 'environment-set' ? { ...env, [mutation.name]: mutation.value } : env
      return { agentDefaultEnv: { ...settings.agentDefaultEnv, [mutation.agent]: nextEnv } }
    }
  }
}
