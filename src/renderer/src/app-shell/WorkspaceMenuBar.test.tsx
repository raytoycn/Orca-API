// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WorkspaceMenuBar } from './WorkspaceMenuBar'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const fixture = vi.hoisted(() => ({ sidebarOpen: true }))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: { sidebarOpen: boolean }) => unknown) => select(fixture)
}))
beforeEach(() => {
  fixture.sidebarOpen = true
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('reserves the measured floating controls width only while the sidebar is collapsed', () => {
  const { rerender } = render(<WorkspaceMenuBar />)
  expect(screen.queryByTestId('workspace-menu-sidebar-spacer')).toBeNull()
  fixture.sidebarOpen = false
  rerender(<WorkspaceMenuBar />)
  expect(screen.getByTestId('workspace-menu-sidebar-spacer').style.width).toBe(
    'var(--collapsed-sidebar-header-width, 0px)'
  )
  expect(screen.getAllByRole('button')).toHaveLength(5)
  fixture.sidebarOpen = true
  rerender(<WorkspaceMenuBar />)
  expect(screen.queryByTestId('workspace-menu-sidebar-spacer')).toBeNull()
})

it('does not reserve floating controls when the normal titlebar already contains them', () => {
  fixture.sidebarOpen = false
  render(<WorkspaceMenuBar reserveFloatingControls={false} />)
  expect(screen.queryByTestId('workspace-menu-sidebar-spacer')).toBeNull()
  expect(screen.getAllByRole('button')).toHaveLength(5)
})

it('opens each existing menu below its horizontal button without switching agents', () => {
  const popupMenu = vi.fn()
  vi.stubGlobal('api', { ui: { popupMenu } })
  render(<WorkspaceMenuBar />)
  const buttons = screen.getAllByRole('button')
  expect(buttons.map((button) => button.textContent)).toEqual([
    'File',
    'Edit',
    'View',
    'Window',
    'Help'
  ])
  for (const [index, menu] of ['file', 'edit', 'view', 'window', 'help'].entries()) {
    fireEvent.click(buttons[index])
    expect(popupMenu).toHaveBeenLastCalledWith({ menu, x: 0, y: 0 })
  }
})
