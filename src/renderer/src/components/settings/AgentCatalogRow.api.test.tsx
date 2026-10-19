// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { AgentCatalogRow } from './AgentCatalogRow'

vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))

it('lets an uninstalled agent configure its API through a dedicated button', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      root.render(
        <AgentCatalogRow
          agentId="gemini"
          label="Gemini"
          homepageUrl="https://geminicli.com"
          defaultCmd="gemini"
          defaultArgs=""
          defaultEnv={{}}
          isDetected={false}
          isEnabled
          isDefault={false}
          cmdOverride={undefined}
          argsOverride=""
          envOverride={{ SECRET: 'fixture-secret' }}
          environmentNames={['SECRET']}
          onSetDefault={() => {}}
          onSetEnabled={() => {}}
          onSaveOverride={() => {}}
          onSaveArgs={() => {}}
          onSaveEnv={() => {}}
          apiEditor={<div>Gemini API form</div>}
        />
      )
    })
    expect(container.textContent).not.toContain('fixture-secret')
    expect(container.textContent).not.toContain('Gemini API form')
    const button = Array.from(container.querySelectorAll('button')).find(
      (value) => value.textContent === 'Configure API'
    )
    expect(button).toBeTruthy()
    act(() => {
      button?.click()
    })
    expect(container.textContent).toContain('Gemini API form')
  } finally {
    act(() => {
      root.unmount()
    })
    container.remove()
  }
})
