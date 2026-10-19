import {
  agentModelCatalogEntry,
  agentModelCatalogListingKey,
  type AgentModelCatalogEntry,
  type AgentModelCatalogListing
} from './agent-model-catalog-entry'

export function pruneAgentModelCatalogEntries(input: {
  entries: Map<string, AgentModelCatalogEntry>
  dueEntries: Set<string>
  notify: (fingerprint: string) => void
  save: (entries: readonly AgentModelCatalogEntry[]) => void
  agent: string
  keepModelId: (modelId: string) => boolean
}): void {
  const { entries, dueEntries, notify, save, agent, keepModelId } = input
  let changed = false
  const pruneListing = (
    listing: AgentModelCatalogListing | null
  ): AgentModelCatalogListing | null => {
    const kept = listing?.models.filter((model) => keepModelId(model.id)) ?? []
    return listing && kept.length > 0 ? { ...listing, models: kept } : null
  }
  for (const [fingerprint, entry] of entries) {
    if (entry.agent !== agent) {
      continue
    }
    const discovered = pruneListing(entry.discovered)
    const live = pruneListing(entry.live)
    const configured =
      entry.configured && keepModelId(entry.configured.modelId) ? entry.configured : null
    const next = agentModelCatalogEntry(agent, fingerprint, discovered, live, configured)
    if (next) {
      if (agentModelCatalogListingKey(next) !== agentModelCatalogListingKey(entry)) {
        entries.set(fingerprint, next)
        changed = true
      }
    } else {
      entries.delete(fingerprint)
      dueEntries.delete(fingerprint)
      changed = true
    }
    notify(fingerprint)
  }
  if (changed) {
    save([...entries.values()])
  }
}
