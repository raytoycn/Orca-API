// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  AgentWorkspaceSwitcher,
  type AgentWorkspaceSwitcherController
} from './AgentWorkspaceSwitcher'

const fixture = vi.hoisted(() => {
  const tabs: Tab[] = []
  return { tabs, detectedIds: ['codex'] as TuiAgent[], activate: vi.fn(() => true) }
})
vi.mock('@/store', () => ({
  useAppStore: (
    select: (state: {
      settings: null
      unifiedTabsByWorktree: Record<string, Tab[]>
      activeGroupIdByWorktree: Record<string, string>
      groupsByWorktree: Record<string, { id: string; activeTabId: string | null }[]>
    }) => unknown
  ) =>
    select({
      settings: null,
      unifiedTabsByWorktree: { workspace: fixture.tabs },
      activeGroupIdByWorktree: {},
      groupsByWorktree: {}
    })
}))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: fixture.activate
}))
vi.mock('@/hooks/useAgentDetectionTarget', () => ({
  useAgentDetectionTargetForWorktree: () => ({ kind: 'local', worktreeId: 'workspace' })
}))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: fixture.detectedIds })
}))
vi.mock('./AgentCombobox', () => ({
  default: ({
    agents,
    onValueChange
  }: {
    agents: { id: TuiAgent }[]
    onValueChange: (agent: TuiAgent) => void
  }) => (
    <div data-testid="agent-options">
      {agents.map((agent) => (
        <button key={agent.id} onClick={() => onValueChange(agent.id)}>
          {agent.id}
        </button>
      ))}
    </div>
  )
}))

function controller(): AgentWorkspaceSwitcherController {
  return {
    renderedActiveWorktreeId: 'workspace',
    activeTabId: null,
    tabsByWorktree: {},
    handleActivateTab: vi.fn(),
    handleNewAgentTab: vi.fn()
  }
}

beforeEach(() => {
  fixture.tabs.length = 0
  fixture.detectedIds = ['codex']
  fixture.activate.mockClear()
})
afterEach(cleanup)

describe('workspace Agent switcher', () => {
  it('returns to an existing structured conversation without creating another one', () => {
    fixture.tabs.push({
      id: 'codex-tab',
      entityId: 'session-one',
      groupId: 'group',
      worktreeId: 'workspace',
      contentType: 'agent-session',
      label: 'Codex',
      customLabel: null,
      color: null,
      sortOrder: 0,
      createdAt: 1,
      agentSessionAgent: 'codex'
    })
    const actions = controller()
    render(<AgentWorkspaceSwitcher controller={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'codex' }))
    expect(fixture.activate).toHaveBeenCalledWith({ worktreeId: 'workspace', tabId: 'codex-tab' })
    expect(actions.handleNewAgentTab).not.toHaveBeenCalled()
  })
  it('starts the selected agent when this workspace has no conversation for it', () => {
    const actions = controller()
    render(<AgentWorkspaceSwitcher controller={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'codex' }))
    expect(actions.handleNewAgentTab).toHaveBeenCalledWith('codex')
  })
  it('starts Orca Agent chat instead of reopening a stale terminal tab', () => {
    const actions = controller()
    actions.tabsByWorktree = {
      workspace: [
        {
          id: 'old-orca-terminal',
          entityId: 'terminal-one',
          groupId: 'group',
          worktreeId: 'workspace',
          contentType: 'terminal',
          label: 'Orca Agent',
          ptyId: null,
          title: 'Orca Agent',
          customTitle: null,
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 1,
          launchAgent: 'orca-agent'
        } as TerminalTab
      ]
    }
    render(<AgentWorkspaceSwitcher controller={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'orca-agent' }))
    expect(actions.handleNewAgentTab).toHaveBeenCalledWith('orca-agent')
    expect(actions.handleActivateTab).not.toHaveBeenCalled()
  })
  it('offers a separate new conversation with the built-in Agent', () => {
    const actions = controller()
    render(<AgentWorkspaceSwitcher controller={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(actions.handleNewAgentTab).toHaveBeenCalledWith('orca-agent')
  })

  it('lists only detected agents plus the built-in Orca Agent', () => {
    fixture.detectedIds = ['claude', 'codex']
    render(<AgentWorkspaceSwitcher controller={controller()} />)
    expect(screen.getByTestId('agent-options').textContent).toBe('orca-agentclaudecodex')
    expect(screen.queryByRole('button', { name: 'cursor' })).toBeNull()
  })
})
