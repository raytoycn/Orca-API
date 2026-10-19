import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  agentApiProfileContent,
  configureAgentApiEnvironment,
  type AgentApiConnection
} from '../../shared/agent-api-connection'
import {
  AGENT_API_ARGUMENTS_ENV,
  agentApiLaunchArguments
} from '../../shared/agent-api-launch-args'
import { agentApiCatalogCredentials } from '../../shared/agent-api-model-catalog'

async function writeProfileFile(filename: string, content: string): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode: 0o600 })
    await rename(temporary, filename)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function prepareAgentApiProfile(
  connection: AgentApiConnection,
  userDataPath: string,
  connections: readonly AgentApiConnection[] = []
): Promise<Record<string, string>> {
  const profile = agentApiProfileContent(connection, connections)
  if (!profile) {
    return {}
  }
  // Immutable, credential-free profiles keep failed settings writes and running sessions isolated.
  const digest = createHash('sha256').update(JSON.stringify(profile)).digest('hex')
  const directory = join(userDataPath, 'agent-api-profiles', connection.agent, digest)
  await mkdir(directory, { recursive: true })
  const filename = join(directory, profile.filename ?? 'settings.json')
  await writeProfileFile(filename, profile.content)
  for (const [name, content] of Object.entries(profile.extraFiles ?? {})) {
    await writeProfileFile(join(directory, name), content)
  }
  return {
    ...(connections.length ? agentApiCatalogCredentials(connection, connections) : {}),
    ...(connection.agent === 'orca-agent' ? { DSH_HOME: join(userDataPath, 'orca-agent') } : {}),
    [profile.variable]: profile.directory ? directory : filename,
    ...(connection.agent === 'codex'
      ? {
          [AGENT_API_ARGUMENTS_ENV]: JSON.stringify([
            ...agentApiLaunchArguments(configureAgentApiEnvironment({}, connection)),
            '-c',
            `model_catalog_json=${JSON.stringify(filename)}`
          ])
        }
      : {}),
    ...(profile.argumentFlag
      ? { [AGENT_API_ARGUMENTS_ENV]: JSON.stringify([profile.argumentFlag, filename]) }
      : {})
  }
}
