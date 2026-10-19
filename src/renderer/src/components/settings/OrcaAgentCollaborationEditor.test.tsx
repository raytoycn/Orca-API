// @vitest-environment happy-dom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultOrcaAgentCollaborationSettings,
  type OrcaAgentCollaborationSettings
} from '../../../../shared/orca-agent-collaboration'
import { OrcaAgentCollaborationEditor } from './OrcaAgentCollaborationEditor'

function ControlledEditor(): React.JSX.Element {
  const [settings, setSettings] = useState<OrcaAgentCollaborationSettings>(
    defaultOrcaAgentCollaborationSettings()
  )
  return <OrcaAgentCollaborationEditor presets={[]} settings={settings} onChange={setSettings} />
}

afterEach(cleanup)

describe('OrcaAgentCollaborationEditor', () => {
  it('shows the single-agent reasoning effort control', () => {
    render(<ControlledEditor />)

    expect(screen.getByLabelText('单 Agent 思考模式')).toBeTruthy()
  })

  it('switches modes and lets the user add, remove, and coordinate custom roles', () => {
    render(<ControlledEditor />)

    fireEvent.click(screen.getByRole('radio', { name: '多角色协同' }))
    expect(screen.getAllByLabelText('角色名称')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: '添加角色' }))
    expect(screen.getAllByLabelText('角色名称')).toHaveLength(5)

    fireEvent.click(screen.getAllByRole('button', { name: '删除角色' })[4]!)
    expect(screen.getAllByLabelText('角色名称')).toHaveLength(4)

    fireEvent.click(screen.getAllByRole('button', { name: '设为协调角色' })[0]!)
    expect(screen.getByRole('button', { name: '当前协调角色' })).toBeTruthy()
  })
})
