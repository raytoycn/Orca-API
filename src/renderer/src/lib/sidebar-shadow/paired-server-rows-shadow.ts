import { useAppStore, type AppState } from '@/store'
import { getAllWorktreesFromState, getRepoMapFromState } from '@/store/selectors'
import { DEFAULT_WORKSPACE_STATUS_ID } from '../../../../shared/workspace-statuses'
import { getWorkspaceRowKindFacts } from '../../../../shared/worktree/workspace-kinds'
import { projectResolvedWorktreeLineage } from '../../../../shared/resolved-worktree-lineage'
import type { WorktreeLineage } from '../../../../shared/worktree/lineage-types'
import {
  folderWorkspaceRepoId,
  folderWorkspaceToWorktree
} from '../../../../shared/folder-workspace-worktree'
import {
  PairedServerRowsSnapshotSchema,
  type PairedServerHostFacts,
  type PairedServerWorkspaceRow
} from '../../../../shared/sidebar-list/paired-server-rows'
import { describePairedServerHosts } from '../../../../shared/paired-server-hosts'
import { getHostDisplayLabelOverrides } from '../../../../shared/host-setting-overrides'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../../shared/worktree/types'
import { defineSidebarShadowDomain, type SidebarShadowMainRead } from './sidebar-shadow-comparison'

/** The paired-server rows the window fetched itself, keyed by host-qualified id, for these hosts. */
export function readWindowPairedServerRows(
  state: Pick<AppState, 'worktreesByRepo' | 'folderWorkspaces' | 'repos' | 'worktreeLineageById'>,
  hostIds: ReadonlySet<string>
): Map<string, PairedServerWorkspaceRow> {
  const rows = new Map<string, PairedServerWorkspaceRow>()
  const repoById = getRepoMapFromState(state)
  // The server sends only edges its own check keeps, so the window checks its copy the same way.
  const checkedLineageByKey = new Map<string, WorktreeLineage | null>()
  for (const hostId of hostIds) {
    const hostWorktrees = getAllWorktreesFromState(state).filter(
      (worktree) => worktree.hostId === hostId
    )
    for (const worktree of projectResolvedWorktreeLineage(
      hostWorktrees,
      state.worktreeLineageById
    )) {
      checkedLineageByKey.set(getWorktreeHostIdentity(worktree), worktree.lineage)
    }
  }
  const add = (worktree: Worktree, kind: PairedServerWorkspaceRow['kind']): void => {
    if (!worktree.hostId || !hostIds.has(worktree.hostId)) {
      return
    }
    const key = getWorktreeHostIdentity(worktree)
    const lineage = checkedLineageByKey.get(key)
    // The server's reply carries no automation name, so the row leaves it out too.
    const { automationName: _automationName, ...kindFacts } = getWorkspaceRowKindFacts(
      worktree,
      repoById.get(worktree.repoId)
    )
    rows.set(key, {
      key,
      worktreeId: worktree.id,
      repoId: worktree.repoId,
      kind,
      path: worktree.path,
      branch: worktree.branch,
      displayName: worktree.displayName,
      isArchived: worktree.isArchived,
      isPinned: worktree.isPinned,
      isMainWorktree: worktree.isMainWorktree,
      isUnread: worktree.isUnread,
      instanceId: worktree.instanceId,
      lineage: lineage
        ? {
            parentWorktreeId: lineage.parentWorktreeId,
            worktreeInstanceId: lineage.worktreeInstanceId,
            parentWorktreeInstanceId: lineage.parentWorktreeInstanceId
          }
        : null,
      workspaceStatus: worktree.workspaceStatus ?? DEFAULT_WORKSPACE_STATUS_ID,
      sortOrder: worktree.sortOrder,
      manualOrder: worktree.manualOrder,
      createdAt: worktree.createdAt,
      creatorProvenance: worktree.creatorProvenance,
      ...kindFacts,
      recentAt: worktree.lastActivityAt,
      smartTier: worktree.smartTier,
      smartAt: worktree.smartAt
    })
  }
  for (const worktree of getAllWorktreesFromState(state)) {
    add(worktree, 'git')
  }
  for (const folder of state.folderWorkspaces ?? []) {
    add(folderWorkspaceToWorktree(folder), 'folder')
  }
  return rows
}

function windowListedRepoIds(
  state: Pick<AppState, 'worktreesByRepo' | 'folderWorkspaces'>
): Set<string> {
  return new Set([
    ...Object.keys(state.worktreesByRepo),
    ...(state.folderWorkspaces ?? []).map((folder) => folderWorkspaceRepoId(folder.projectGroupId))
  ])
}

async function readMainSnapshot() {
  const response = await window.api.runtime.call({ method: 'sidebarInputs.pairedServerRows' })
  const parsed = response.ok ? PairedServerRowsSnapshotSchema.safeParse(response.result) : null
  return parsed?.success ? parsed.data : null
}

export const pairedServerRowsShadow = defineSidebarShadowDomain<
  PairedServerWorkspaceRow,
  SidebarShadowMainRead<PairedServerWorkspaceRow> & { liveHostIds: ReadonlySet<string> }
>({
  name: 'paired-server-rows',
  readMain: async () => {
    const snapshot = await readMainSnapshot()
    if (!snapshot) {
      return null
    }
    // Only servers main last reached: an unverifiable server's rows are its last, not its current.
    const live = snapshot.servers.filter((server) => server.freshness === 'live')
    // Only projects the window has listed: it fetches a server's new project after main does.
    const listed = windowListedRepoIds(useAppStore.getState())
    return {
      revision: snapshot.revision,
      values: new Map(
        live.flatMap((server) =>
          server.rows.flatMap((row) => (listed.has(row.repoId) ? [[row.key, row] as const] : []))
        )
      ),
      liveHostIds: new Set(live.map((server) => server.hostId))
    }
  },
  readWindow: (main) => readWindowPairedServerRows(useAppStore.getState(), main.liveHostIds),
  // Stamps and unread move with every server event, so a fetch either side made a moment apart differs.
  equals: (window, main) =>
    JSON.stringify(withoutStamps(window)) === JSON.stringify(withoutStamps(main))
})

function withoutStamps(
  row: PairedServerWorkspaceRow | undefined
): Partial<PairedServerWorkspaceRow> | null {
  if (!row) {
    return null
  }
  const {
    recentAt: _recentAt,
    smartTier: _smartTier,
    smartAt: _smartAt,
    isUnread: _isUnread,
    ...rest
  } = row
  return rest
}

/** The window's header facts for these servers, from its own status, environment and label state. */
export function readWindowPairedServerHosts(
  state: Pick<
    AppState,
    | 'runtimeEnvironments'
    | 'runtimeStatusByEnvironmentId'
    | 'sshTargetLabels'
    | 'sshConnectionStates'
    | 'settings'
  >,
  hostIds: ReadonlySet<string>
): Map<string, PairedServerHostFacts> {
  const hosts = describePairedServerHosts({
    environments: state.runtimeEnvironments,
    statusByEnvironmentId: state.runtimeStatusByEnvironmentId,
    sshTargetLabels: state.sshTargetLabels,
    sshConnectionStates: state.sshConnectionStates,
    hostLabelOverrides: getHostDisplayLabelOverrides(state.settings)
  })
  return new Map(
    hosts.flatMap(({ hostId, label, health, compatibility, pairedDeviceId }) =>
      hostIds.has(hostId)
        ? [[hostId, { label, health, compatibility, pairedDeviceId }] as const]
        : []
    )
  )
}

export const pairedServerHostsShadow = defineSidebarShadowDomain<
  PairedServerHostFacts,
  SidebarShadowMainRead<PairedServerHostFacts> & { hostIds: ReadonlySet<string> }
>({
  name: 'paired-server-hosts',
  readMain: async () => {
    const snapshot = await readMainSnapshot()
    if (!snapshot) {
      return null
    }
    return {
      revision: snapshot.revision,
      values: new Map(
        snapshot.servers.flatMap((server) =>
          server.host ? [[server.hostId, server.host] as const] : []
        )
      ),
      // Main lists only servers a phone may reach, never this desktop's own WSL hosts.
      hostIds: new Set(snapshot.servers.map((server) => server.hostId))
    }
  },
  readWindow: (main) => readWindowPairedServerHosts(useAppStore.getState(), main.hostIds),
  equals: (window, main) => JSON.stringify(window ?? null) === JSON.stringify(main ?? null)
})
