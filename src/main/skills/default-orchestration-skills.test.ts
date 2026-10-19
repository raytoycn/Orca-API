import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { installDefaultOrchestrationSkills } from './default-orchestration-skills'

it('installs both bundled skills offline, repeats safely, and preserves user edits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-default-skills-'))
  try {
    const sourceRoot = join(root, 'source')
    for (const name of ['orca-cli', 'orchestration']) {
      await mkdir(join(sourceRoot, name), { recursive: true })
      await writeFile(
        join(sourceRoot, name, 'SKILL.md'),
        `---\nname: ${name}\ndescription: Test skill\n---\n\nUse Orca.\n`
      )
    }
    const input = {
      sourceRoot,
      homeDirectory: join(root, 'home'),
      stateDirectory: join(root, 'state'),
      detectedProviders: ['codex', 'claude'],
      env: {}
    }
    await installDefaultOrchestrationSkills(input)
    await installDefaultOrchestrationSkills(input)
    const installed = join(input.homeDirectory, '.agents', 'skills', 'orchestration', 'SKILL.md')
    expect(
      await readFile(
        join(input.homeDirectory, '.claude', 'skills', 'orchestration', 'SKILL.md'),
        'utf8'
      )
    ).toContain('Use Orca.')
    await writeFile(installed, 'local edits')
    await expect(installDefaultOrchestrationSkills(input)).rejects.toThrow('conflict')
    expect(await readFile(installed, 'utf8')).toBe('local edits')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
