import type { ExecutionHostId } from '../execution-host'
import {
  composeWorktreeHostIdentity,
  getWorktreeHostIdentity
} from '../worktree/host-qualified-identity'
import type { Worktree } from '../worktree/types'

/** The desktop's open workspace, as its session saves it; both null when nothing is open. */
export type ActiveSidebarWorkspace = {
  worktreeId: string | null
  hostId: ExecutionHostId | null
}

/** Every occurrence of the open workspace highlights, so a pinned duplicate shows twice. */
export function isActiveSidebarWorkspace(
  worktree: Pick<Worktree, 'id' | 'hostId'>,
  active: ActiveSidebarWorkspace
): boolean {
  return (
    active.worktreeId === worktree.id &&
    (!active.hostId ||
      getWorktreeHostIdentity(worktree) === composeWorktreeHostIdentity(active.hostId, worktree.id))
  )
}
