import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = resolve(process.argv[2] ?? join(root, 'config/orca-agent-engine'))
const destination = join(root, 'resources/builtin-agents/orca-agent')
const manifest = JSON.parse(
  readFileSync(join(source, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')
)
if (manifest.version !== '0.2.0-rc.2') {
  throw new Error('Expected DeepSeek Harness 0.2.0-rc.2')
}
mkdirSync(destination, { recursive: true })
cpSync(join(source, 'node_modules'), join(destination, 'node_modules'), { recursive: true })
cpSync(process.execPath, join(destination, process.platform === 'win32' ? 'node.exe' : 'node'))
writeFileSync(
  join(destination, 'engine.json'),
  JSON.stringify(
    {
      name: 'Orca Agent',
      engine: '@deepseek-ai/dsh',
      version: manifest.version,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.versions.node,
      license: 'MIT',
      source: 'https://github.com/deepseek-ai/deepseek-harness'
    },
    null,
    2
  )
)
const launcher = `import { fileURLToPath } from 'node:url'\nconst patch = process.env.ORCA_HARNESS_PATCH\nif (!patch) { console.error('Configure an API for Orca Agent in Settings before starting.'); process.exit(1) }\nconst entry = new URL('./node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url)\nprocess.argv = [process.execPath, fileURLToPath(entry), '--profile', 'acp', '--patch', patch, ...process.argv.slice(2)]\nconst { runCli } = await import(entry.href)\nawait runCli()\n`
writeFileSync(join(destination, 'launcher.mjs'), launcher)
writeFileSync(
  join(destination, 'orca-agent.cmd'),
  '@echo off\r\n"%~dp0node.exe" "%~dp0launcher.mjs" %*\r\n'
)
writeFileSync(
  join(destination, 'orca-agent'),
  '#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/launcher.mjs" "$@"\n'
)
chmodSync(join(destination, 'orca-agent'), 0o755)
const license = join(source, 'node_modules/@deepseek-ai/dsh/LICENSE')
if (!existsSync(license)) {
  throw new Error('Harness license missing from runtime')
}
cpSync(license, join(destination, 'LICENSE-DeepSeek-Harness'))
console.log(`Prepared ${manifest.name}@${manifest.version}: ${destination}`)
