import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ApplicationMenuPopup } from '../../../shared/application-menu-popup'

const MENUS: { id: ApplicationMenuPopup['menu']; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'edit', label: 'Edit' },
  { id: 'view', label: 'View' },
  { id: 'window', label: 'Window' },
  { id: 'help', label: 'Help' }
]

export function WorkspaceMenuBar({
  reserveFloatingControls = true
}: {
  reserveFloatingControls?: boolean
}): React.JSX.Element {
  const sidebarOpen = useAppStore((state) => state.sidebarOpen)
  return (
    <nav
      className="flex h-9 w-full min-w-0 shrink-0 select-none items-center border-b px-2 [-webkit-app-region:drag]"
      aria-label={translate('auto.App.8b0b8eb54f', 'Application menu')}
      data-testid="workspace-menu-bar"
    >
      {reserveFloatingControls && !sidebarOpen && (
        <div
          className="h-full shrink-0 [-webkit-app-region:no-drag]"
          style={{ width: 'var(--collapsed-sidebar-header-width, 0px)' }}
          data-testid="workspace-menu-sidebar-spacer"
          aria-hidden="true"
        />
      )}
      {MENUS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="rounded px-3 py-1 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [-webkit-app-region:no-drag]"
          aria-haspopup="menu"
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect()
            window.api.ui.popupMenu({
              menu: id,
              x: Math.round(bounds.left),
              y: Math.round(bounds.bottom)
            })
          }}
        >
          {translate(`menu.${id}`, label)}
        </button>
      ))}
    </nav>
  )
}
