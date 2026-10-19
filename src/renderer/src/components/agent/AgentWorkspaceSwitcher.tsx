import { useState } from 'react'
import { Plus } from 'lucide-react'
import AgentCombobox from './AgentCombobox'
import { Button } from '@/components/ui/button'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activateStructuredAgentSessionTab } from '@/lib/structured-agent-session-tab-activation'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { DEFAULT_DISABLED_TUI_AGENTS } from '../../../../shared/tui-agent-selection'
import type { Tab } from '../../../../shared/tab-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { TerminalController } from '../use-terminal-controller'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'

const EMPTY_TABS: Tab[] = []

export type AgentWorkspaceSwitcherController = Pick<
  TerminalController,
  | 'renderedActiveWorktreeId'
  | 'tabsByWorktree'
  | 'activeTabId'
  | 'handleActivateTab'
  | 'handleNewAgentTab'
>

export function AgentWorkspaceSwitcher({
  controller
}: {
  controller: AgentWorkspaceSwitcherController
}): React.JSX.Element | null {
  const [selected, setSelected] = useState<TuiAgent>('orca-agent')
  const disabled = useAppStore(
    (state): readonly TuiAgent[] => state.settings?.disabledTuiAgents ?? DEFAULT_DISABLED_TUI_AGENTS
  )
  const { renderedActiveWorktreeId, tabsByWorktree, activeTabId } = controller
  const unified = useAppStore((state) =>
    renderedActiveWorktreeId
      ? (state.unifiedTabsByWorktree[renderedActiveWorktreeId] ?? EMPTY_TABS)
      : EMPTY_TABS
  )
  const currentTabId = useAppStore((state) => {
    if (!renderedActiveWorktreeId) {
      return activeTabId
    }
    const groupId = state.activeGroupIdByWorktree[renderedActiveWorktreeId]
    return (
      state.groupsByWorktree[renderedActiveWorktreeId]?.find((group) => group.id === groupId)
        ?.activeTabId ?? activeTabId
    )
  })
  const detectionTarget = useAgentDetectionTargetForWorktree(renderedActiveWorktreeId)
  const { detectedIds } = useDetectedAgents(detectionTarget)
  if (!renderedActiveWorktreeId) {
    return null
  }
  const tabs = tabsByWorktree[renderedActiveWorktreeId] ?? []
  const structuredAgent = unified.find((tab) => tab.id === currentTabId)?.agentSessionAgent
  const activeAgent =
    structuredAgent && isTuiAgent(structuredAgent)
      ? structuredAgent
      : (tabs.find((tab) => tab.id === activeTabId)?.launchAgent ?? selected)
  const agents = getAgentCatalog().filter(
    (entry) =>
      (entry.id === 'orca-agent' || entry.id === activeAgent || detectedIds?.includes(entry.id)) &&
      (!disabled.includes(entry.id) || entry.id === activeAgent)
  )
  const selectAgent = (agent: TuiAgent): void => {
    setSelected(agent)
    const chat = unified.find(
      (tab) => tab.contentType === 'agent-session' && tab.agentSessionAgent === agent
    )
    if (
      chat &&
      activateStructuredAgentSessionTab({ worktreeId: renderedActiveWorktreeId, tabId: chat.id })
    ) {
      return
    }
    // The built-in Orca Agent's terminal fallback is not its conversation. Reopening the
    // workspace must create a native chat when its structured session was not restored.
    if (agent === 'orca-agent') {
      controller.handleNewAgentTab(agent)
      return
    }
    const existing = tabs.find((tab) => tab.launchAgent === agent)
    if (existing) {
      controller.handleActivateTab(existing.id)
    } else {
      controller.handleNewAgentTab(agent)
    }
  }
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
      data-testid="agent-workspace-switcher"
    >
      <span className="text-xs text-muted-foreground">
        {translate('components.agentWorkspaceSwitcher.agent', 'Agent')}
      </span>
      <div className="w-72 shrink-0">
        <AgentCombobox
          agents={agents}
          value={activeAgent}
          onValueChange={selectAgent}
          triggerClassName="w-full"
        />
      </div>
      <Button variant="ghost" size="sm" onClick={() => controller.handleNewAgentTab(activeAgent)}>
        <Plus className="size-4" />
        {translate('components.agentWorkspaceSwitcher.newChat', 'New chat')}
      </Button>
      <span className="truncate text-xs text-muted-foreground">
        {translate(
          'components.agentWorkspaceSwitcher.preserve',
          'Switch agents to continue their separate chats'
        )}
      </span>
    </div>
  )
}
