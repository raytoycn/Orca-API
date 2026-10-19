import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createSkillPackageArchive } from './skill-package-creation'
import { installSharedSkill } from './skill-install-service'
import {
  resolveEnvironmentSkillProviderRoots,
  resolveDefaultHermesSkillsRoot,
  resolveEnvironmentHermesSkillsRoot
} from './skill-provider-runtime-roots'

export async function installDefaultOrchestrationSkills(input: {
  sourceRoot: string
  homeDirectory: string
  stateDirectory: string
  detectedProviders: readonly string[]
  env?: NodeJS.ProcessEnv
}): Promise<void> {
  const cache = join(input.stateDirectory, 'default-skills')
  const failures: string[] = []
  await mkdir(cache, { recursive: true })
  for (const name of ['orca-cli', 'orchestration']) {
    const archive = await createSkillPackageArchive({
      sourceDirectory: join(input.sourceRoot, name),
      archivePath: join(cache, `${name}.tar.gz`),
      packageId: `orca-default-${name}`,
      versionId: 'bundled'
    })
    const result = await installSharedSkill({
      operationId: randomUUID(),
      archivePath: archive.archivePath,
      scope: 'global',
      homeDirectory: input.homeDirectory,
      orcaStateDirectory: input.stateDirectory,
      detectedProviders: input.detectedProviders,
      providerRootOverrides: {
        ...resolveEnvironmentSkillProviderRoots(input.env ?? process.env, input.homeDirectory),
        hermes:
          resolveEnvironmentHermesSkillsRoot(input.env ?? process.env) ??
          resolveDefaultHermesSkillsRoot({
            homeDir: input.homeDirectory,
            env: input.env ?? process.env
          })
      },
      destinationIdentity: 'global:orca-default-skills',
      hostIdentity: 'local',
      expectedArchiveSha256: archive.archiveSha256,
      expectedPackageDigest: archive.manifest.packageDigest,
      expectedPackageId: archive.manifest.packageId,
      expectedVersionId: archive.manifest.versionId,
      conflictResolution: 'replace-unmodified'
    })
    if (!['installed', 'updated', 'unchanged'].includes(result.status)) {
      failures.push(`Default skill ${name}: ${result.errorCategory ?? result.status}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('; '))
  }
}
