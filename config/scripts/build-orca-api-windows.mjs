import { spawnProcess } from '@orca/process-host'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') {
  throw new Error('The Windows installer requires a Windows build host')
}

const cwd = fileURLToPath(new URL('../..', import.meta.url))
function resolvePnpmCli() {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const shim = join(directory, 'pnpm.cmd')
    if (!existsSync(shim)) {
      continue
    }
    const entry = readFileSync(shim, 'utf8').match(/"%~dp0([^"\r\n]*pnpm\.mjs)"/i)?.[1]
    if (entry) {
      return resolve(dirname(shim), entry)
    }
  }
  throw new Error('Could not resolve pnpm.mjs from PATH')
}
const pnpmCli = resolvePnpmCli()
const env = {
  ...process.env,
  ORCA_RELEASE_REPO: 'raytoycn/Orca-API',
  ORCA_BACKGROUND_LAUNCH: '1',
  ORCA_REUSE_PREPARED_NATIVE_RUNTIME: '1',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false'
}

async function run(program, args) {
  const child = spawnProcess({ program, args, cwd, env, stdio: 'inherit' })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) {
    throw new Error(`${program} exited with ${code}`)
  }
}

if (
  !existsSync(resolve(cwd, 'config/orca-agent-engine/node_modules/@deepseek-ai/dsh/package.json'))
) {
  await run('npm', [
    'ci',
    '--prefix',
    'config/orca-agent-engine',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund'
  ])
}
await run(process.execPath, ['config/scripts/prepare-orca-agent-engine.mjs'])
await run(process.execPath, [pnpmCli, 'run', 'build:desktop'])
await run(process.execPath, [pnpmCli, 'run', 'ensure:electron-runtime'])

// NSIS cannot open pnpm template paths longer than the Windows legacy path limit.
const letter = [...'ZYXWVUTSRQPON'].find((value) => !existsSync(`${value}:\\`))
if (!letter) {
  throw new Error('A free drive letter is required for the Windows NSIS build')
}
const drive = `${letter}:`
await run('subst.exe', [drive, cwd])
try {
  await run(process.execPath, [
    `${drive}/node_modules/electron-builder/out/cli/cli.js`,
    '--projectDir',
    `${drive}/`,
    '--config',
    `${drive}/config/electron-builder.orca-api.cjs`,
    `--config.directories.output=${resolve(cwd, '../ORCA-Windows-x64')}`,
    '--win',
    'nsis',
    '--x64',
    '--publish',
    'never'
  ])
} finally {
  await run('subst.exe', [drive, '/D'])
}
