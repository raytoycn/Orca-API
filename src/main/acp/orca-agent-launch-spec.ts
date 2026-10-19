import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { AcpLaunchSpec } from './acp-launch-specs'
import { directoryAccountBinding } from './acp-account-binding'
import { GENERIC_ACP_DIALECT } from './acp-dialects/acp-dialect'

export function bundledOrcaAgentDirectory(): string {
  if (process.env.ORCA_AGENT_RUNTIME_DIR) {
    return process.env.ORCA_AGENT_RUNTIME_DIR
  }
  const resources = process.resourcesPath ?? join(process.cwd(), 'resources')
  const candidates = [
    join(resources, 'builtin-agents', 'orca-agent'),
    join(resources, 'app.asar.unpacked', 'resources', 'builtin-agents', 'orca-agent')
  ]
  const command = process.platform === 'win32' ? 'orca-agent.cmd' : 'orca-agent'
  return candidates.find((directory) => existsSync(join(directory, command))) ?? candidates[0]
}

export function bundledOrcaAgentCommand(): string {
  const filename = join(
    bundledOrcaAgentDirectory(),
    process.platform === 'win32' ? 'orca-agent.cmd' : 'orca-agent'
  )
  return existsSync(filename) ? filename : 'orca-agent'
}

export const ORCA_AGENT_LAUNCH_SPEC: AcpLaunchSpec = {
  agent: 'orca-agent',
  command: bundledOrcaAgentCommand(),
  args: () => [],
  env: {},
  dialect: GENERIC_ACP_DIALECT,
  loginCommand: [],
  account: directoryAccountBinding('DSH_HOME', (home) => join(home, '.orca-agent')),
  installDirectories: () => [bundledOrcaAgentDirectory()],
  modelDiscovery: {
    kind: 'unavailable',
    reason: 'Orca Agent lists configured models when its ACP session starts'
  },
  transcriptImport: null,
  sessionHistory: {
    rowAgents: [],
    rowSessionId: (link) => link.handle.nativeId,
    parseResumeArgs: () => null
  }
}
