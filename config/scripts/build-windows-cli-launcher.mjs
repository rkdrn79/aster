#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileWindowsRustExecutable } from './windows-rust-executable-build.mjs'
import productBrand from '../../src/shared/product-brand.json' with { type: 'json' }

function readArg(name) {
  const index = process.argv.indexOf(name)
  return index !== -1 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = resolve(import.meta.dirname, '../..')
  const crateRoot = join(repoRoot, 'native', 'windows-cli-launcher')
  const iconPath = join(repoRoot, 'resources', 'build', `${productBrand.id}.ico`)
  const cliFileName = `${productBrand.cliName}.exe`
  const output = readArg('--output') ?? join(crateRoot, '.build', cliFileName)
  for (const binName of ['cli-launcher', 'orca-administrator-restart']) {
    const isCliLauncher = binName === 'cli-launcher'
    compileWindowsRustExecutable({
      repoRoot,
      crateRoot,
      binName,
      label: isCliLauncher ? 'Windows CLI launcher' : 'Windows administrator restart launcher',
      fingerprintInputs: [
        join(crateRoot, 'src', 'administrator_status.rs'),
        join(crateRoot, 'src', 'administrator_restart.rs'),
        join(crateRoot, 'src', 'administrator_launcher.rs'),
        iconPath,
        join(repoRoot, 'config/scripts/build-windows-cli-launcher.mjs'),
        join(repoRoot, 'src/shared/product-brand.json')
      ],
      arch: readArg('--arch'),
      outputPath: isCliLauncher ? output : join(dirname(output), `${binName}.exe`),
      buildEnv: (version) => ({
        ORCA_LAUNCHER_VERSION: version,
        ORCA_LAUNCHER_ICON: iconPath,
        ORCA_LAUNCHER_FILENAME: isCliLauncher ? cliFileName : `${binName}.exe`,
        ORCA_LAUNCHER_PRODUCT_NAME: productBrand.name,
        ORCA_LAUNCHER_COMPANY_NAME: productBrand.copyrightHolder
      })
    })
  }
}
