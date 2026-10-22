const path = require('node:path')
const { globSync, readFileSync } = require('node:fs')
const base = require('./electron-builder.config.cjs')
const { collectRuntimeClosure } = require('./scripts/verify-skills-cli-runtime.cjs')
const root = path.resolve(__dirname, '..')
module.exports = {
  ...base,
  asarUnpack: [
    ...base.asarUnpack,
    ...collectRuntimeClosure(path.join(root, 'out'))
      .filter((file) => file.startsWith(path.join(root, 'out') + path.sep))
      .map((file) => path.relative(root, file).split(path.sep).join('/'))
  ],
  extraResources: [
    ...(base.extraResources ?? []),
    { from: 'resources/builtin-agents/orca-agent', to: 'builtin-agents/orca-agent' },
    {
      from: 'resources/builtin-agents/orca-agent/node_modules',
      to: 'builtin-agents/orca-agent/node_modules'
    },
    ...['orca-cli', 'orchestration'].map((name) => ({
      from: `skills/${name}`,
      to: `default-agent-skills/${name}`
    }))
  ],
  files: [
    'out/**/*',
    'resources/**/*',
    '!resources/builtin-agents/**/*',
    'package.json',
    'LICENSE',
    ...base.files.filter((entry) => typeof entry === 'string' && entry.startsWith('!'))
  ],
  async afterPack(context) {
    await base.afterPack(context)
    const resources =
      context.electronPlatformName === 'darwin'
        ? path.join(
            context.appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
            'Contents/Resources'
          )
        : path.join(context.appOutDir, 'resources')
    const entry = path.join(
      resources,
      'builtin-agents/orca-agent/node_modules/@deepseek-ai/dsh/lib/bin.js'
    )
    if (!require('node:fs').existsSync(entry)) {
      throw new Error('Packaged Orca Agent is missing its Harness runtime dependencies')
    }
  },
  beforePack(context) {
    if (
      !require('node:fs').existsSync(
        path.join(root, 'resources/builtin-agents/orca-agent/engine.json')
      )
    ) {
      throw new Error('Run prepare-orca-agent-engine.mjs before packaging')
    }
    const engine = JSON.parse(
      readFileSync(path.join(root, 'resources/builtin-agents/orca-agent/engine.json'), 'utf8')
    )
    const architecture = { 0: 'ia32', 1: 'x64', 3: 'arm64' }[context.arch]
    if (
      engine.version !==
        JSON.parse(readFileSync(path.join(root, 'config/orca-agent-engine/package.json'), 'utf8'))
          .dependencies['@deepseek-ai/dsh'] ||
      engine.platform !== context.electronPlatformName ||
      engine.arch !== architecture
    ) {
      throw new Error(
        'Prepare Orca Agent on a host matching the packaging platform and architecture'
      )
    }
    base.beforePack(context)
    const files = globSync('out/main/**/*.js', { cwd: root })
    if (
      !files.some((file) =>
        readFileSync(path.join(root, file), 'utf8').includes('raytoycn/Orca-API')
      )
    ) {
      throw new Error('Build the desktop with ORCA_RELEASE_REPO=raytoycn/Orca-API before packaging')
    }
  },
  appId: 'com.raytoycn.orca-api',
  productName: 'Orca API',
  extraMetadata: {
    ...base.extraMetadata,
    name: 'orca-api',
    homepage: 'https://github.com/raytoycn/Orca-API'
  },
  directories: { ...base.directories, output: path.resolve(__dirname, '../../ORCA-Windows-x64') },
  win: { ...base.win, signtoolOptions: { sign: base.win.signtoolOptions.sign } },
  nsis: {
    ...base.nsis,
    artifactName: 'Orca-API-${version}-x64-Setup.${ext}',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    runAfterFinish: false
  },
  publish: { provider: 'github', owner: 'raytoycn', repo: 'Orca-API' }
}
