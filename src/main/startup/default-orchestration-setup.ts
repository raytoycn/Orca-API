import { app } from 'electron'
import { join } from 'node:path'
import { CliInstaller } from '../cli/cli-installer'
import { detectInstalledAgentsWithShellPathHydration } from '../preflight/agent-detection'
import { installDefaultOrchestrationSkills } from '../skills/default-orchestration-skills'

export async function setupDefaultOrchestration(): Promise<void> {
  await new CliInstaller({
    privilegedRunner: async () => {
      throw new Error('Default orchestration requires a user-writable CLI location')
    }
  })
    .install()
    .catch((error) => console.warn('[orchestration] CLI registration failed:', error))
  await installDefaultOrchestrationSkills({
    sourceRoot: app.isPackaged
      ? join(process.resourcesPath, 'default-agent-skills')
      : join(app.getAppPath(), 'skills'),
    homeDirectory: app.getPath('home'),
    stateDirectory: app.getPath('userData'),
    detectedProviders: await detectInstalledAgentsWithShellPathHydration()
  })
}
