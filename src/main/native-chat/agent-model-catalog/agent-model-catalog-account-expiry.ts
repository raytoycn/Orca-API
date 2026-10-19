import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { AgentModelCatalogStore } from './agent-model-catalog-store'
import type { AgentApiPreset } from '../../../shared/agent-api-presets'
import { summarizeAgentApiPresets } from '../../../shared/agent-api-presets'
import { uniqueOrcaAgentApiPresets } from '../../../shared/agent-api-model-catalog'
import { parseOrcaProviderModel } from '../../../shared/orca-agent-collaboration'

// The settings whose change swaps the account an agent's chats sign in with.
const ACCOUNT_SETTINGS = {
  claudeManagedAccounts: 'claude',
  activeClaudeManagedAccountId: 'claude',
  activeClaudeManagedAccountIdsByRuntime: 'claude',
  codexManagedAccounts: 'codex',
  activeCodexManagedAccountId: 'codex',
  activeCodexManagedAccountIdsByRuntime: 'codex'
} satisfies Partial<Record<keyof GlobalSettings, string>>

/** A chosen, re-signed or removed account changes what the probe found, so the next catalog
 *  read re-probes instead of serving the old account's answer. */
export function expireAgentModelCatalogFailuresForSettings(
  store: Pick<AgentModelCatalogStore, 'expireFailures'>,
  updates: Partial<GlobalSettings>
): void {
  const agents = new Set(
    Object.entries(ACCOUNT_SETTINGS)
      .filter(([key]) => key in updates)
      .map(([, agent]) => agent)
  )
  for (const agent of agents) {
    store.expireFailures(agent)
  }
}

// The settings that pick the binary and environment an agent's probe and chats launch with.
type AgentLaunchSettings = Partial<Pick<GlobalSettings, 'agentCmdOverrides' | 'agentDefaultEnv'>>

function launchKeys(settings: AgentLaunchSettings): Map<string, string> {
  const commands = new Map<string, string | undefined>(
    Object.entries(settings.agentCmdOverrides ?? {})
  )
  const envs = new Map<string, Record<string, string> | undefined>(
    Object.entries(settings.agentDefaultEnv ?? {})
  )
  const keys = new Map<string, string>()
  for (const agent of new Set([...commands.keys(), ...envs.keys()])) {
    const env = Object.entries(envs.get(agent) ?? {}).sort(([a], [b]) => a.localeCompare(b))
    keys.set(agent, JSON.stringify([commands.get(agent) ?? null, env]))
  }
  return keys
}

/** Agents whose command or launch env differs between the two settings. */
export function agentsWithChangedLaunchSettings(
  previous: AgentLaunchSettings,
  next: AgentLaunchSettings
): string[] {
  const before = launchKeys(previous)
  const after = launchKeys(next)
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (agent) => before.get(agent) !== after.get(agent)
  )
}

/** A settings listener that expires the catalogs a change made stale: an account change expires
 *  the agent's held reasons; a command or env change also marks its catalogs due for a listing. */
export function createAgentModelCatalogSettingsExpiry(
  store: Pick<AgentModelCatalogStore, 'expireFailures' | 'expireAgent'>,
  initial: AgentLaunchSettings
): (updates: Partial<GlobalSettings>, settings: AgentLaunchSettings) => void {
  let launch: AgentLaunchSettings = {
    agentCmdOverrides: initial.agentCmdOverrides,
    agentDefaultEnv: initial.agentDefaultEnv
  }
  return (updates, settings) => {
    expireAgentModelCatalogFailuresForSettings(store, updates)
    if (!('agentCmdOverrides' in updates) && !('agentDefaultEnv' in updates)) {
      return
    }
    const next = {
      agentCmdOverrides: settings.agentCmdOverrides,
      agentDefaultEnv: settings.agentDefaultEnv
    }
    for (const agent of agentsWithChangedLaunchSettings(launch, next)) {
      store.expireAgent(agent)
    }
    launch = next
  }
}
/** Removes cached Orca Agent model rows whose saved API preset/provider no longer exists. */
export function pruneOrcaAgentModelCatalogForApiPresets(
  store: Pick<AgentModelCatalogStore, 'pruneAgentModels'>,
  presets: readonly AgentApiPreset[]
): void {
  const validProviderIds = new Set(
    uniqueOrcaAgentApiPresets(summarizeAgentApiPresets(presets))
      .map((preset) => preset.modelProviderId)
      .filter((providerId): providerId is string => providerId !== undefined)
  )
  store.pruneAgentModels('orca-agent', (modelId) => {
    const parsed = parseOrcaProviderModel(modelId)
    return parsed === null || validProviderIds.has(parsed.providerId)
  })
}
