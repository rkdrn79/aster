// Aster's install identity is separate from the upstream app. Only release builds
// embed its own update feed; local builds remain disconnected.
const base = require('./electron-builder.config.cjs')
const brand = require('../src/shared/product-brand.json')
const { resolveAsterUpdateFeed } = require('./scripts/aster-update-feed.cjs')
const updateFeed = resolveAsterUpdateFeed() ?? brand.links.updateFeed
// electron-builder needs a publish provider to emit latest-mac.yml; the ad hoc app still embeds no feed.
const artifactFeed =
  updateFeed ??
  (process.env.ASTER_ADHOC_RELEASE === '1'
    ? 'https://github.com/rkdrn79/aster/releases/latest/download'
    : null)

const researchHarnessResource = { from: 'src/research-harness', to: 'research-harness' }
// MIT requires the upstream copyright and permission notice to travel with every copy.
const noticesResource = { from: brand.licenseNoticeFile, to: brand.licenseNoticeFile }
// Skill packages install from the app itself; the upstream repository has no Aster commits.
const skillPackagesResource = { from: 'skills', to: 'skills' }
const asterResources = [researchHarnessResource, noticesResource, skillPackagesResource]
// The feature tour only mounts in the upstream product, and its media records upstream's UI.
const upstreamOnlyResources = new Set(['resources/onboarding/feature-wall'])
const baseResources = (resources) =>
  resources.filter((resource) => !upstreamOnlyResources.has(resource.from))
const copyright = `Copyright © ${brand.copyrightYear} ${brand.copyrightHolder}`

module.exports = {
  ...base,
  appId: brand.appId,
  productName: brand.name,
  copyright,
  protocols: [{ name: brand.name, schemes: [brand.urlScheme] }],
  // Why extraMetadata: the workspace package keeps its name for pnpm filters; only shipped metadata changes.
  extraMetadata: {
    ...base.extraMetadata,
    // NSIS names the per-user install folder after this, which upstream also installs into.
    name: brand.id,
    productName: brand.name,
    description: brand.description,
    // An object: extraMetadata skips package.json normalization, and a string author leaves
    // Aster.exe's CompanyName and the uninstall entry's Publisher at Electron's own.
    author: { name: brand.copyrightHolder },
    homepage: brand.links.homepage
  },
  files: [
    ...base.files,
    // Native iOS DerivedData and other local build outputs are not desktop runtime inputs.
    '!build{,/**/*}',
    // Repo-only drafts, captures and tool configs have no runtime consumer.
    '!plugins{,/**/*}',
    // Icon sources only generate resources/build and resources/tray.
    '!resources/icon-source{,/**/*}',
    '!test-results{,/**/*}',
    '!{.anti-slop-plugin,.github,.husky,.cache}{,/**/*}',
    '!{.gitattributes,.gitignore,.oxfmtrc.json,.oxlintrc.json,components.json,opencode.json,orca.yaml,pnpm-workspace.yaml,vite.web.config.ts,THIRD_PARTY_NOTICES.md}'
  ],
  publish: artifactFeed ? { provider: 'generic', url: artifactFeed } : null,
  win: {
    ...base.win,
    extraResources: [...baseResources(base.win.extraResources), ...asterResources],
    executableName: brand.name,
    icon: `resources/build/${brand.id}.ico`,
    signtoolOptions: undefined,
    // Archive targets such as zip use this; nsis keeps its own name below.
    artifactName: `${brand.id}-windows-\${arch}.\${ext}`
  },
  nsis: {
    ...base.nsis,
    artifactName: `${brand.id}-windows-setup.\${ext}`,
    // The upstream hook installs the upstream CLI/agent files and registers its URL handler.
    include: undefined
  },
  mac: {
    ...base.mac,
    // An unsigned GitHub Actions release needs an explicit ad hoc app signature before archiving.
    ...(process.env.ASTER_ADHOC_RELEASE === '1' ? { identity: '-' } : {}),
    extraResources: [...baseResources(base.mac.extraResources), ...asterResources],
    icon: `resources/build/${brand.id}.icns`,
    artifactName: 'Aster-mac-${arch}.${ext}'
  },
  dmg: { ...base.dmg, artifactName: 'Aster-mac-${arch}.${ext}' },
  linux: {
    ...base.linux,
    extraResources: [...baseResources(base.linux.extraResources), ...asterResources],
    executableName: brand.id,
    icon: `resources/build/${brand.id}.icns`,
    desktop: { entry: { StartupWMClass: brand.id } },
    maintainer: brand.copyrightHolder
  },
  appImage: { ...base.appImage, artifactName: `${brand.id}-linux.\${ext}` },
  deb: {
    ...base.deb,
    packageName: `${brand.id}-ade`,
    artifactName: `${brand.id}-ade_\${version}_\${arch}.\${ext}`,
    // Upstream package hooks install `orca-ide` system-wide.
    afterInstall: undefined,
    afterRemove: undefined
  },
  rpm: {
    ...base.rpm,
    packageName: `${brand.id}-ade`,
    artifactName: `${brand.id}-ade-\${version}.\${arch}.\${ext}`,
    afterInstall: undefined,
    afterRemove: undefined
  }
}
