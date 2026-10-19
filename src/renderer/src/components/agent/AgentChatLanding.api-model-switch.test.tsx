// @vitest-environment happy-dom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentChatLanding } from './AgentChatLanding'

const fixture = vi.hoisted(() => ({
  liveModels: null as { id: string; name: string; contextWindow?: number }[] | null,
  runtime: vi.fn(async (_target: unknown, method: string, params?: { presetId?: string }) => {
    if (method !== 'settings.listAgentApiModels') {
      return undefined
    }
    if (fixture.liveModels) {
      return fixture.liveModels
    }
    return (
      fixture.state.settings.agentApiPresets.find((preset) => preset.id === params?.presetId)
        ?.models ?? []
    )
  }),
  launch: vi.fn(() => ({
    structuredSettlement: Promise.resolve({ kind: 'structured', sessionId: 'session-1' })
  })),
  state: {
    worktreesByRepo: { repo: [{ id: 'tree', displayName: 'Main' }] },
    repos: [{ id: 'repo', displayName: 'Repo' }],
    settings: {
      agentApiPresets: [
        {
          id: 'provider-a',
          name: 'Provider A',
          connection: {
            agent: 'orca-agent',
            protocol: 'openai-completions',
            baseUrl: 'https://a.example/v1',
            model: 'a-one',
            credentialType: 'api-key'
          },
          models: [
            { id: 'a-one', name: 'A One' },
            { id: 'a-two', name: 'A Two' }
          ]
        },
        {
          id: 'provider-b',
          name: 'Provider B',
          connection: {
            agent: 'orca-agent',
            protocol: 'openai-completions',
            baseUrl: 'https://b.example/v1',
            model: 'b-one',
            credentialType: 'api-key'
          },
          models: [
            { id: 'b-one', name: 'B One' },
            { id: 'b-two', name: 'B Two' }
          ]
        }
      ],
      activeAgentApiPresets: { 'orca-agent': 'provider-a' }
    },
    openModal: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof fixture.state) => unknown) => selector(fixture.state),
    { getState: () => fixture.state }
  )
}))
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.runtime }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: fixture.launch }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: () => 'request' }))
vi.mock('@/lib/agent-catalog', () => ({
  getAgentCatalog: () => [{ id: 'orca-agent', displayName: 'Orca Agent' }]
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select aria-label="模型" value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null
}))
vi.mock('./AgentCombobox', () => ({
  default: ({ value }: { value: string }) => <span data-testid="agent">{value}</span>
}))

afterEach(() => {
  cleanup()
  fixture.liveModels = null
  fixture.state.settings.agentApiPresets[0].models = [
    { id: 'a-one', name: 'A One' },
    { id: 'a-two', name: 'A Two' }
  ]
})

it('refreshes a one-model cached preset to the full live model list', async () => {
  fixture.liveModels = Array.from({ length: 17 }, (_, index) => ({
    id: `model-${index + 1}`,
    name: `Model ${index + 1}`
  }))
  fixture.state.settings.agentApiPresets[0].models = [{ id: 'model-1', name: 'Model 1' }]

  render(<AgentChatLanding onChatStarted={vi.fn()} />)

  await vi.waitFor(() => {
    expect(screen.getByLabelText('模型').querySelectorAll('option')).toHaveLength(19)
  })
  expect(screen.getByLabelText('模型').textContent).toContain('Model 17 · Provider A')

})

it('shows models from every API and launches the first prompt with the selected API/model', async () => {
  fixture.liveModels = null
  const onChatStarted = vi.fn()
  render(<AgentChatLanding onChatStarted={onChatStarted} />)
  const modelPicker = screen.getByLabelText<HTMLSelectElement>('模型')
  expect(modelPicker.options).toHaveLength(4)
  expect(modelPicker.textContent).toContain('B Two · Provider B')

  fireEvent.change(modelPicker, { target: { value: JSON.stringify(['provider-b', 'b-two']) } })
  await vi.waitFor(() => {
    expect(fixture.runtime).toHaveBeenCalledWith({ kind: 'local' }, 'settings.mutateAgentLaunch', {
      type: 'api-preset-activate',
      agent: 'orca-agent',
      id: 'provider-b',
      model: 'b-two',
      contextWindow: 1000000
    })
  })
  await vi.waitFor(() => {
    expect(modelPicker.value).toBe(JSON.stringify(['provider-b', 'b-two']))
  })

  fireEvent.change(screen.getByLabelText('输入需求'), { target: { value: '你好' } })
  fireEvent.click(screen.getByRole('button', { name: '发送需求' }))
  await vi.waitFor(() => {
    expect(fixture.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'orca-agent',
        prompt: '你好',
        promptDelivery: 'auto-submit',
        activate: false
      })
    )
  })
  await vi.waitFor(() => {
    expect(onChatStarted).toHaveBeenCalledWith({
      agent: 'orca-agent',
      sessionId: 'session-1',
      worktreeId: 'tree'
    })
  })
})
