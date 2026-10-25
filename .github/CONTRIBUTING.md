# Contributing to Aster

Thanks for helping improve Aster. Bug reports, fixes and focused features are all welcome.

## Reporting issues

Report bugs and request features in this repository's
[Issues](https://github.com/rkdrn79/aster/issues). For a bug, include your macOS version, the Aster
version (**Aster → About Aster**), what you did, what you expected, and what happened. Logs or a
small project that reproduces it help a lot. Please search existing issues first.

## Build and run

Install Node 24, pnpm, and the Bun version in [`config/.bun-version`](../config/.bun-version).

```bash
pnpm install --frozen-lockfile
pnpm dev                     # run the app from source
pnpm build:aster:mac         # local macOS package (electron-builder --dir)
```

`pnpm dev` keeps its own profile, so it never overwrites an installed Aster. Set
`ORCA_DEV_MAIN_SOURCEMAPS=0` before `pnpm dev` to cut main-process rebuild CPU and memory when
you don't need its source maps.

## Test, typecheck and lint

```bash
pnpm tc                      # typecheck (or tc:node / tc:web / tc:cli)
pnpm test                    # unit tests, or `pnpm test path/to/file.test.ts`
node --test src/research-harness/*.test.mjs
pnpm run check:code-quality:changed   # lint the files you changed
pnpm format                  # format
pnpm lint                    # full lint and repository checks (slow)
```

Add tests that would catch a regression in the behavior you changed, not shallow coverage of the
happy path. See [`docs/reference/test-antipatterns.md`](../docs/reference/test-antipatterns.md).

## Engineering rules

[`AGENTS.md`](../AGENTS.md) holds the full conventions. The short version:

- **Cross-platform.** Keep code working on macOS, Linux and Windows unless it is guarded by a
  runtime platform check. Use `CmdOrCtrl` in menu accelerators, show `⌘`/`⇧` on macOS and
  `Ctrl+`/`Shift+` elsewhere, and build paths with `path.join`.
- **Local and remote.** Aster runs agents locally and over SSH. Don't assume a process, file,
  credential, shell or network path exists only on the local machine.
- **Folder workspaces.** Not every workspace is a git worktree.
- **Provider-neutral.** Keep generic behavior neutral across agents, integrations and git
  providers; guard provider-specific logic behind explicit checks.
- **UI.** Follow [`docs/STYLEGUIDE.md`](../docs/STYLEGUIDE.md), its tokens and the shadcn
  primitives, and check light and dark mode.
- **Reuse first.** Extend an existing implementation before writing a parallel one. Name files
  after what they contain, never `helpers` or `utils`.
- **Types.** Project-owned type declarations go in `.ts` files, not `.d.ts`: `skipLibCheck` turns
  unresolved types in a `.d.ts` into `any`. CI enforces this for `src/preload/` and `src/shared/`.

## Commits and pull requests

- Use a descriptive branch name, such as `fix/claims-stale-badge` or `feat/library-arxiv-import`.
- Write commit subjects in [Conventional Commits](https://www.conventionalcommits.org/) style with
  a scope where it helps, for example `fix(writing): keep the Claims drawer beside the PDF` or
  `docs: explain the research harness`.
- Keep each pull request to one topic and fill in
  [`pull_request_template.md`](./pull_request_template.md). Link the issue it addresses.
- Attach before and after screenshots or a short video for UI changes.
- Run `pnpm tc`, `pnpm test` and `pnpm run check:code-quality:changed` before opening it.

Releases and version bumps are handled by the maintainer. Don't change the version in a normal
contribution.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](../LICENSE).
