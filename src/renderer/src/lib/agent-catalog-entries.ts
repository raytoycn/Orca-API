import { primaryAgentCatalogEntries } from './agent-catalog-entries-primary'
import { secondaryAgentCatalogEntries } from './agent-catalog-entries-secondary'
import type { AgentCatalogEntry } from './agent-catalog'

/** The catalog rows, in display order. */
export function buildAgentCatalogEntries(): AgentCatalogEntry[] {
  return [
    {
      id: 'orca-agent',
      label: 'Orca Agent',
      cmd: 'orca-agent',
      searchAliases: ['DeepSeek Harness', '内置智能体'],
      homepageUrl: 'https://github.com/deepseek-ai/deepseek-harness'
    },
    ...primaryAgentCatalogEntries(),
    ...secondaryAgentCatalogEntries()
  ]
}
