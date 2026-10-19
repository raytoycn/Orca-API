import type { ClaudeAccountSwitchSettings } from './claude-account-switch-settings'
import type { NativeChatGlobalSettings } from './native-chat-appearance-settings'
import type { WorktreeDeletionPreferences } from './worktree-deletion-preferences'
import type { OrcaAgentCollaborationSettingsGroup } from './orca-agent-collaboration-settings'

/** Settings groups owned by their feature modules and composed into GlobalSettings. */
export type GlobalSettingsBase = NativeChatGlobalSettings &
  WorktreeDeletionPreferences &
  ClaudeAccountSwitchSettings &
  OrcaAgentCollaborationSettingsGroup
