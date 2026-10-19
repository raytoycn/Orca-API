import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bundledOrcaAgentCommand, bundledOrcaAgentDirectory } from './orca-agent-launch-spec'

describe('bundled Orca Agent paths', () => {
  const originalResourcesPath = process.resourcesPath
  const originalRuntimeDir = process.env.ORCA_AGENT_RUNTIME_DIR
  let root: string | undefined

  afterEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: originalResourcesPath
    })
    if (originalRuntimeDir === undefined) {
      delete process.env.ORCA_AGENT_RUNTIME_DIR
    } else {
      process.env.ORCA_AGENT_RUNTIME_DIR = originalRuntimeDir
    }
    if (root) {
      rmSync(root, { recursive: true, force: true })
      root = undefined
    }
  })

  it('finds the runtime when packaged under app.asar.unpacked/resources', () => {
    root = mkdtempSync(join(tmpdir(), 'orca-agent-runtime-'))
    const runtime = join(root, 'app.asar.unpacked', 'resources', 'builtin-agents', 'orca-agent')
    mkdirSync(runtime, { recursive: true })
    const entry = join(runtime, process.platform === 'win32' ? 'orca-agent.cmd' : 'orca-agent')
    writeFileSync(entry, '')
    delete process.env.ORCA_AGENT_RUNTIME_DIR
    Object.defineProperty(process, 'resourcesPath', { configurable: true, value: root })

    expect(bundledOrcaAgentDirectory()).toBe(runtime)
    expect(bundledOrcaAgentCommand()).toBe(entry)
  })
})
