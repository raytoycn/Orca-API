// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AgentApiConnectionEditor } from './AgentApiConnectionEditor'

const runtime = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: runtime.callRuntimeRpc }))

it('saves only the chosen agent and clears the secret after successful persistence', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const mutate = vi.fn().mockResolvedValue(undefined)
  try {
    await act(async () => {
      root.render(<AgentApiConnectionEditor agent="claude" mutate={mutate} />)
    })
    const inputs = container.querySelectorAll('input')
    const values = ['https://api.example.test/anthropic', 'fixture-secret']
    act(() => {
      inputs.forEach((input, index) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
          input,
          values[index]
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
    })
    runtime.callRuntimeRpc.mockResolvedValue([
      { id: 'fixture-model-a', name: 'Fixture A', contextWindow: 8192 },
      { id: 'fixture-model-b', name: 'Fixture B', contextWindow: 16384 }
    ])
    const fetchModels = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Fetch models'
    )
    await act(async () => {
      fetchModels?.click()
    })
    const save = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save'
    )
    expect(save?.disabled).toBe(false)
    await act(async () => {
      save?.click()
    })
    expect(mutate).toHaveBeenCalledWith({
      type: 'api-preset-save',
      preset: {
        id: expect.any(String),
        name: 'api.example.test',
        connection: {
          agent: 'claude',
          protocol: 'anthropic-messages',
          credentialType: 'api-key',
          baseUrl: values[0],
          model: 'fixture-model-a',
          apiKey: values[1],
          contextWindow: 8192
        },
        models: [
          { id: 'fixture-model-a', name: 'Fixture A', contextWindow: 8192 },
          { id: 'fixture-model-b', name: 'Fixture B', contextWindow: 16384 }
        ]
      }
    })
    expect(inputs[1].value).toBe('')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Saved')
    const remove = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Remove API override'
    )
    await act(async () => {
      remove?.click()
    })
    expect(mutate).toHaveBeenLastCalledWith({ type: 'api-clear', agent: 'claude' })
  } finally {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
})
