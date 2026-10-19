import type { AgentLaunchPreferences } from '../../../../../../shared/agent-session-host-authority'
import { isOrcaProviderModel } from '../../../../../../shared/orca-agent-collaboration'
import { OrchestrationError } from '../../../../orchestration/orchestration-error'

export function orcaWorkerPreferences(model: string, effort?: string): AgentLaunchPreferences {
  if (!isOrcaProviderModel(model)) {
    throw new OrchestrationError(
      'invalid_argument',
      'Choose an Orca Agent provider-qualified model.'
    )
  }
  if (effort && !['off', 'low', 'medium', 'high'].includes(effort)) {
    throw new OrchestrationError('invalid_argument', 'Unsupported Orca Agent reasoning effort.')
  }
  return { model, ...(effort ? { effort } : {}) }
}

export function assertOrcaWorkerStructuredLaunch(args: {
  agent?: string | null
  model?: string
  mode: string
}): void {
  if (args.agent === 'orca-agent' && args.model && args.mode !== 'structured') {
    throw new OrchestrationError(
      'capability_unsupported',
      'Orca Agent worker model selection requires structured chat on this host. Enable native chat before starting this worker.'
    )
  }
}
