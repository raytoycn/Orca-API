import { isArtifactSharingEnabled } from '../../shared/artifact-sharing-gate'
import { isAgentSkillSharingEnabled } from '../../shared/agent-skill-sharing-gate'
import { TASK_PROVIDERS } from '../../shared/task-providers'
import { normalizeSourceControlAiSettings } from '../../shared/source-control-ai'
import { SOURCE_CONTROL_LAUNCH_ACTION_IDS } from '../../shared/source-control-ai-actions'
import type { RuntimeStore } from './runtime-store-contract'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { getHostDisplayLabelOverrides } from '../../shared/host-setting-overrides'
import type {
  RuntimeClientSettings,
  RuntimeClientSourceControlAi,
  RuntimeHostDisplayLabelOverrides
} from './runtime-client-settings-shape'

export function projectRuntimeClientSettings(
  settings: ReturnType<RuntimeStore['getSettings']>
): RuntimeClientSettings {
  return {
    defaultTuiAgent: settings.defaultTuiAgent ?? null,
    newWorkspaceSetupOnly: false,
    disabledTuiAgents: settings.disabledTuiAgents ?? [],
    agentCmdOverrides: settings.agentCmdOverrides ?? {},
    agentDefaultArgs: settings.agentDefaultArgs ?? {},
    agentDefaultEnv: settings.agentDefaultEnv ?? {},
    agentStatusHooksEnabled: settings.agentStatusHooksEnabled !== false,
    // Why projected: mobile's terminal Copy honours this, and a host predating
    // the setting sends no key, which the client reads as on (#19770).
    terminalCopyTrimsGutter: settings.terminalCopyTrimsGutter !== false,
    defaultTaskSource: settings.defaultTaskSource ?? 'github',
    defaultTaskViewPreset: settings.defaultTaskViewPreset ?? 'issues',
    visibleTaskProviders: settings.visibleTaskProviders ?? [...TASK_PROVIDERS],
    defaultRepoSelection: settings.defaultRepoSelection ?? null,
    // Persisted settings can violate the paired client's string-array contract.
    defaultLinearTeamSelection: Array.isArray(settings.defaultLinearTeamSelection)
      ? settings.defaultLinearTeamSelection.filter((id): id is string => typeof id === 'string')
      : null,
    githubProjects: settings.githubProjects,
    experimentalNewWorktreeCardStyle: settings.experimentalNewWorktreeCardStyle === true,
    experimentalNativeChat: settings.experimentalNativeChat === true,
    // Older clients use this key to fall back to terminal-backed chat. Keep their default terminal.
    openAgentTabsInChatByDefault: false,
    experimentalStructuredNativeChat: settings.experimentalNativeChat === true,
    compactWorktreeCards: settings.compactWorktreeCards === true,
    minimaxGroupId: settings.minimaxGroupId ?? '',
    minimaxUsageModels: settings.minimaxUsageModels ?? 'general',
    minimaxEndpoint: settings.minimaxEndpoint ?? 'overseas',
    zcodePlanSite: settings.zcodePlanSite ?? 'zai',
    prBotAuthorOverrides: settings.prBotAuthorOverrides ?? [],
    artifactSharingEnabled: isArtifactSharingEnabled(settings),
    worktreeVisibilityDefaults: settings.worktreeVisibilityDefaults ?? { external: 'hide' },
    agentSkillSharingEnabled: isAgentSkillSharingEnabled(settings),
    machineName: settings.machineName ?? '',
    // Why projected: a web client's Settings → Chat edits this host's new-chat default.
    ...(settings.nativeChatPermissionMode
      ? { nativeChatPermissionMode: settings.nativeChatPermissionMode }
      : {}),
    ...(settings.agentNativeChatPermissionModes
      ? { agentNativeChatPermissionModes: settings.agentNativeChatPermissionModes }
      : {}),
    // Why projected: a paired client's AI buttons start these actions' agents, and must honour
    // the agent saved for each one as the desktop does. Absent on older hosts.
    sourceControlAi: projectSourceControlLaunchRecipes(settings),
    hostSettingOverrides: Object.fromEntries(
      [
        ...getHostDisplayLabelOverrides({ hostSettingOverrides: settings.hostSettingOverrides })
      ].map(([hostId, displayLabel]) => [hostId, { displayLabel }])
    ) as RuntimeHostDisplayLabelOverrides
  }
}

function projectSourceControlLaunchRecipes(
  settings: Partial<Pick<GlobalSettings, 'sourceControlAi' | 'commitMessageAi'>>
): RuntimeClientSourceControlAi {
  const { actions } = normalizeSourceControlAiSettings(
    settings.sourceControlAi,
    settings.commitMessageAi
  )
  return {
    actions: Object.fromEntries(
      SOURCE_CONTROL_LAUNCH_ACTION_IDS.flatMap((actionId) => {
        const recipe = actions?.[actionId]
        return recipe ? [[actionId, recipe]] : []
      })
    )
  }
}
