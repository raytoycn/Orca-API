import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveNativePackageDir } from './native-build-entry.cjs'
import { checkNativeBuildDirLoads, ensureSharedNativeBuild } from './shared-native-build.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))
const require = createRequire(import.meta.url)
if (process.platform === 'win32') {
  for (const moduleName of ['node-pty', '@vscode/windows-process-tree']) {
    // Compile in the existing scratch-copy builder to avoid MSVC's long-path limit.
    ensureSharedNativeBuild({
      moduleName,
      packageDir: resolveNativePackageDir(moduleName, root),
      checkBuildDir: (directory) =>
        checkNativeBuildDirLoads(moduleName, directory, { executable: require('electron') }),
      log: console.log
    })
  }
}
