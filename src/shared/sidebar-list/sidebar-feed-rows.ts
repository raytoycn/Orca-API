import {
  ALL_EXECUTION_HOSTS_SCOPE,
  getSshTargetIdForExecutionHost,
  getWorktreeExecutionHostId,
  normalizeExecutionHostOrder,
  parseExecutionHostId,
  type ExecutionHostId,
  type ExecutionHostScope
} from '../execution-host'
import { buildExecutionHostRegistry } from '../execution-host-registry'
import type { ProjectGroup } from '../project-group-types'
import { getLogicalRepoOrderRankById } from '../project-section-order'
import type { ProjectGroupingModel } from '../project-section-grouping'
import type { Repo } from '../repo-types'
import type { ProjectOrderBy } from '../ui-chrome-types'
import {
  filterFolderWorkspacesFromOtherDevices,
  isWorkspaceOwnedBySomeoneElse
} from '../workspace-creator-visibility'
import type { WorkspaceRowFilters } from '../workspace-view/workspace-row-filters'
import { getWorktreeHostIdentity } from '../worktree/host-qualified-identity'
import { folderWorkspaceToWorktree } from '../folder-workspace-worktree'
import { isActiveSidebarWorkspace } from './active-workspace'
import type { WorkspaceStatusDefinition, Worktree } from '../worktree/types'
import { getEmptyProjectPlaceholderRepoIds } from './empty-project-placeholder-repos'
import {
  filterFolderWorkspacesForVisibleHosts,
  filterProjectGroupsForVisibleHosts,
  getVisibleSidebarHostIdSet
} from './host-filtering'
import { deferHostSectionCollapse, scopeHostSectionCollapse } from './host-section-collapse'
import { orderHostSectionOptions } from './host-section-order'
import {
  addHostSectionRows,
  type HostSectionOption,
  type HostSectionRow
} from './host-section-rows'
import type { PinnedWorktreeDisplayPolicy, Row, WorktreeGroupBy } from './row-types'
import type { SidebarFeedDomains } from './sidebar-feed-domains'
import {
  readFeedLineage,
  readFeedPairedServerRow,
  readFeedWorkspaceRow,
  type SidebarFeedWorkspace
} from './sidebar-feed-worktrees'
import { planSidebarRows } from './sidebar-row-plan'
import { sortWorktreesByStamps, type SortBy } from './smart-sort'
import { selectVisibleSidebarWorktrees } from './visible-worktrees'
import { isIdleWorkspaceActivity } from './workspace-activity-facts'
import { prGroupOfReviewFact } from './workspace-review-facts'

/** The host's view settings a reader shows the list with; the host's own phone reads them off ui.get. */
export type SidebarFeedView = {
  groupBy: WorktreeGroupBy
  sortBy: SortBy
  projectOrderBy: ProjectOrderBy
  collapsedGroups: ReadonlySet<string>
  filters: WorkspaceRowFilters
  workspaceHostScope: ExecutionHostScope
  visibleWorkspaceHostIds: readonly ExecutionHostId[] | null
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  pinnedDisplayPolicy: PinnedWorktreeDisplayPolicy
  /** The host the desktop has focused (its settings' active runtime), where unowned rows land. */
  defaultHostId: ExecutionHostId
  hostLabelOverrides: ReadonlyMap<ExecutionHostId, string>
}

/** The catalog the feed does not carry: every host's repos (repo.list), groups and projects. */
export type SidebarFeedCatalog = {
  repos: readonly Repo[]
  projectGroups: readonly ProjectGroup[]
  projectGrouping: ProjectGroupingModel
}

export type SidebarFeedRows = {
  visibleWorktrees: Worktree[]
  rows: Row[]
  sectionRows: HostSectionRow[]
  /** Row keys of every occurrence of the desktop's open workspace; a pinned duplicate shows twice. */
  activeRowKeys: ReadonlySet<string>
}

function readFeedWorkspaces(domains: SidebarFeedDomains): SidebarFeedWorkspace[] {
  return [
    ...[...domains.workspaces].flatMap(
      ([identity, row]) => readFeedWorkspaceRow(identity, row) ?? []
    ),
    ...[...domains.pairedServerRows.values()].flatMap((row) => readFeedPairedServerRow(row) ?? [])
  ]
}

function buildFeedHostOptions(
  domains: SidebarFeedDomains,
  repos: readonly Repo[],
  view: SidebarFeedView
): HostSectionOption[] {
  const servers = [...domains.pairedServerHosts].flatMap(([hostId, { host }]) => {
    const parsed = parseExecutionHostId(hostId)
    return parsed?.kind === 'runtime' && host ? [{ parsed, host }] : []
  })
  const serverLabelByHostId = new Map<ExecutionHostId, string>(
    servers.map(({ parsed, host }) => [parsed.id, host.label])
  )
  const focused = parseExecutionHostId(view.defaultHostId)
  return buildExecutionHostRegistry({
    repos,
    settings: {
      activeRuntimeEnvironmentId: focused?.kind === 'runtime' ? focused.environmentId : null
    },
    sshTargetLabels: new Map(
      Object.entries(domains.desktop?.sshHosts ?? {}).flatMap(([hostId, host]) => {
        const targetId = getSshTargetIdForExecutionHost(hostId)
        return targetId ? [[targetId, host.label] as const] : []
      })
    ),
    runtimeEnvironments: servers.map(({ parsed, host }) => ({
      id: parsed.environmentId,
      name: host.label
    })),
    hostLabelOverrides: view.hostLabelOverrides
  }).map((host) => {
    const label = serverLabelByHostId.get(host.id)
    return label ? { ...host, label } : host
  })
}

/**
 * The sidebar a feed reader shows: the host's published inputs through the same builder, filters
 * and host sections the desktop window runs, with no clock. The window's transient overlays (drag
 * previews, search, hover hold, agent-send reveal) and its desktop-only cards are not inputs here.
 */
export function buildSidebarFeedRows(
  domains: SidebarFeedDomains,
  catalog: SidebarFeedCatalog,
  view: SidebarFeedView
): SidebarFeedRows {
  const { repos, projectGroups } = catalog
  const { defaultHostId, groupBy } = view
  const workspaces = readFeedWorkspaces(domains)
  const byIdentity = new Map(workspaces.map((entry) => [entry.identity, entry]))
  const gitWorkspaces = workspaces.filter((entry) => entry.folderWorkspace === null)
  const allWorktrees = gitWorkspaces.map((entry) => entry.worktree)
  const folderWorkspaces = workspaces.flatMap((entry) => entry.folderWorkspace ?? [])
  const repoMap = new Map(repos.map((repo) => [repo.id, repo]))
  const worktreeMap = new Map<string, Worktree>()
  const ancestorById = new Map<string, Worktree>()
  const worktreesByRepo: Record<string, Worktree[]> = {}
  for (const worktree of allWorktrees) {
    if (!worktreeMap.has(worktree.id)) {
      worktreeMap.set(worktree.id, worktree)
    }
    if (!worktree.isArchived) {
      ancestorById.set(worktree.id, worktree)
    }
    const repoWorktrees = worktreesByRepo[worktree.repoId]
    if (repoWorktrees) {
      repoWorktrees.push(worktree)
    } else {
      worktreesByRepo[worktree.repoId] = [worktree]
    }
  }
  const lineageById = readFeedLineage(workspaces)
  const retained = new Set(domains.retention?.retainedIds ?? [])
  const factsOf = (worktree: Worktree) => byIdentity.get(getWorktreeHostIdentity(worktree))?.facts
  const pairedDeviceIdsByEnvironment = new Map(
    [...domains.pairedServerHosts].flatMap(([hostId, { host }]) => {
      const environmentId = parseExecutionHostId(hostId)
      return environmentId?.kind === 'runtime' && host?.pairedDeviceId
        ? [[environmentId.environmentId, host.pairedDeviceId] as const]
        : []
    })
  )

  const sorted = sortWorktreesByStamps(
    allWorktrees.filter((worktree) => !worktree.isArchived),
    view.sortBy,
    repoMap
  )
  const visibleWorktrees = selectVisibleSidebarWorktrees({
    rows: allWorktrees,
    ancestorById,
    rankById: new Map(sorted.map((worktree, index) => [worktree.id, index])),
    filters: view.filters,
    facts: {
      isArchived: (worktree) => worktree.isArchived,
      isFolderWorkspace: () => false,
      repoId: (worktree) => worktree.repoId,
      hostId: (worktree) => {
        const repo = repoMap.get(worktree.repoId)
        return repo ? getWorktreeExecutionHostId(worktree, repo, defaultHostId) : null
      },
      isOtherClient: (worktree) =>
        isWorkspaceOwnedBySomeoneElse(worktree, pairedDeviceIdsByEnvironment),
      isDefaultBranch: (worktree) => factsOf(worktree)?.defaultBranch === true,
      isAutomationCreated: (worktree) => factsOf(worktree)?.automationCreated === true,
      isCliCreated: (worktree) => factsOf(worktree)?.cliCreated === true,
      isDetachedHead: (worktree) => factsOf(worktree)?.detachedHead === true,
      isMainWorktree: (worktree) => worktree.isMainWorktree,
      isSleeping: (worktree) => {
        const activity = domains.activity.get(worktree.id)
        return !retained.has(worktree.id) && (!activity || isIdleWorkspaceActivity(activity))
      }
    },
    worktreeLineageById: lineageById,
    filterRepoIds: view.filters.filterRepoIds,
    preserveLineageParentOrder: view.sortBy === 'manual'
  })

  const visibleHostIdSet = getVisibleSidebarHostIdSet(
    view.visibleWorkspaceHostIds,
    view.workspaceHostScope
  )
  const visibleRepos = visibleHostIdSet
    ? repos.filter((repo) =>
        visibleHostIdSet.has(getWorktreeExecutionHostId({}, repo, defaultHostId))
      )
    : repos
  const hostVisibleFolderWorkspaces = filterFolderWorkspacesForVisibleHosts(
    folderWorkspaces,
    projectGroups,
    visibleHostIdSet,
    defaultHostId
  )
  const visibleFolderWorkspaces = view.filters.hideWorkspacesFromOtherDevices
    ? filterFolderWorkspacesFromOtherDevices(
        hostVisibleFolderWorkspaces,
        pairedDeviceIdsByEnvironment
      )
    : hostVisibleFolderWorkspaces
  const listed = new Set(workspaces.map((entry) => entry.worktree.id))
  const pendingCreations = [...domains.creations].flatMap(([creationId, creation]) =>
    creation.worktreeId !== undefined && listed.has(creation.worktreeId)
      ? []
      : [{ creationId, repoId: creation.repoId }]
  )
  const hostOptions = buildFeedHostOptions(domains, repos, view)
  // The catalog's order, not the feed's repoOrder: only it places a paired server's projects.
  const repoOrder = getLogicalRepoOrderRankById(repos.map((repo) => repo.id))
  const plan = planSidebarRows({
    groupBy,
    worktrees: visibleWorktrees,
    repoMap,
    prGroupOf: (worktree) => prGroupOfReviewFact(domains.review.get(worktree.id)),
    repoOrder,
    workspaceStatuses: view.workspaceStatuses,
    projectOrderBy: view.projectOrderBy,
    lineageById,
    worktreeMap,
    nestLineage: true,
    projectGroups: filterProjectGroupsForVisibleHosts(
      projectGroups,
      visibleHostIdSet,
      defaultHostId
    ),
    placeholderRepoIds: getEmptyProjectPlaceholderRepoIds({
      groupBy,
      repos: visibleRepos,
      worktreesByRepo,
      visibleWorktrees,
      filterRepoIds: view.filters.filterRepoIds
    }),
    importedWorktreesByRepo: new Map(),
    newExternalWorktreesInboxByRepo: new Map(),
    pendingCreations,
    projectGrouping: catalog.projectGrouping,
    folderWorkspaces: visibleFolderWorkspaces,
    hostLabelById: new Map(hostOptions.map((host) => [host.id, host.label])),
    defaultHostId,
    pinnedDisplayPolicy: view.pinnedDisplayPolicy,
    filterRepoIds: view.filters.filterRepoIds
  })
  const collapsedGroups = new Set(view.collapsedGroups)
  const hostScoped =
    view.workspaceHostScope !== ALL_EXECUTION_HOSTS_SCOPE || view.visibleWorkspaceHostIds !== null
  const rows = plan.render(hostScoped ? deferHostSectionCollapse(collapsedGroups) : collapsedGroups)
  const sectioned = addHostSectionRows({
    rows,
    hostOptions: orderHostSectionOptions(
      hostOptions,
      normalizeExecutionHostOrder(domains.desktop?.workspaceHostOrder)
    ),
    workspaceHostScope: view.workspaceHostScope,
    visibleWorkspaceHostIds: view.visibleWorkspaceHostIds,
    defaultHostId,
    collapsedHostKeys: collapsedGroups,
    forceCollapseHosts: false,
    preferProjectGrouping: true
  })
  const sectionRows = hostScoped
    ? scopeHostSectionCollapse({ rows: sectioned, collapsedGroups })
    : sectioned
  const active = {
    worktreeId: domains.desktop?.desktopActive.worktreeId ?? null,
    hostId: parseExecutionHostId(domains.desktop?.desktopActive.hostId)?.id ?? null
  }
  const activeRowKeys = new Set<string>()
  for (const row of sectionRows) {
    if (row.type === 'item' && isActiveSidebarWorkspace(row.worktree, active)) {
      activeRowKeys.add(row.rowKey)
    } else if (
      row.type === 'folder-workspace' &&
      isActiveSidebarWorkspace(folderWorkspaceToWorktree(row.folderWorkspace), active)
    ) {
      activeRowKeys.add(row.key)
    }
  }
  return { visibleWorktrees, rows, sectionRows, activeRowKeys }
}
