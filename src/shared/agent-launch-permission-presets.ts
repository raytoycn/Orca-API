import type { AgentLaunchSettingsSource } from './agent-launch-settings'
import {
  agentChatPermissionModes,
  type AgentChatPermissionMode
} from './agent-chat-permission-mode'
import { isTuiAgent } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import {
  AUTO_TUI_AGENT_ARGS,
  YOLO_TUI_AGENT_ARGS,
  YOLO_TUI_AGENT_ENV,
  resolveTuiAgentPermissionMode
} from './tui-agent-permissions'
import { resolveTuiAgentLaunchArgs, resolveTuiAgentLaunchEnv } from './tui-agent-launch-defaults'

export function nativeChatModesForPreset(
  settings: AgentLaunchSettingsSource,
  mode: AgentChatPermissionMode,
  autoOnly: boolean
): Partial<Record<TuiAgent, AgentChatPermissionMode>> {
  return Object.fromEntries(
    [...Object.keys(YOLO_TUI_AGENT_ARGS), ...Object.keys(YOLO_TUI_AGENT_ENV)]
      .filter((agent): agent is TuiAgent => isTuiAgent(agent))
      .filter(
        (agent) =>
          agent in AUTO_TUI_AGENT_ARGS === autoOnly &&
          agentChatPermissionModes(agent) &&
          resolveTuiAgentPermissionMode({
            agent,
            agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
            agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv)
          }) !== 'mixed'
      )
      .map((agent) => [agent, mode])
  )
}
