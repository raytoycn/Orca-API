import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const MODELS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['models', 'list'],
    summary: 'List models available to Orca through API presets and signed-in CLI agents',
    usage: 'orca models list [--agent <id>] [--source api|account] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'source'],
    notes: [
      'Combines models from saved agent API presets and the host model catalogs for signed-in CLI agents.',
      'Use --agent to filter one agent, or omit it to see every agent that currently reports models.',
      'Account-backed models are informational; API-backed models can be switched with `orca models use`.'
    ],
    examples: ['orca models list', 'orca models list --agent grok --json']
  },
  {
    path: ['models', 'use'],
    summary:
      'Switch Orca Agent to an API-backed model, bridging another compatible agent if needed',
    usage: 'orca models use --model <id> [--agent orca-agent|<id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'model'],
    notes: [
      'Defaults to Orca Agent. A compatible API model from another agent is copied into an Orca Agent preset and activated.',
      'Account-backed models cannot be switched from the CLI because their credentials stay inside the source agent.'
    ],
    examples: [
      'orca models use --model gpt-6-astra',
      'orca models use --agent orca-agent --model qwen3.8-max'
    ]
  }
]
