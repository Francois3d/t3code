# Code conventions

> For maintainers and agents. Using T3 Code? See [docs/user](../user/).

This is the convention index. [overview.md](./overview.md) explains what the system does;
this page explains how code in it is written, so a change lands looking like the code
around it.

Authoritative sources, in precedence order:

1. [AGENTS.md](../../AGENTS.md) — product invariants, safety rules, verification limits.
2. [.macroscope/check-run-agents/effect-service-conventions.md](../../.macroscope/check-run-agents/effect-service-conventions.md)
   and [ui-consistency.md](../../.macroscope/check-run-agents/ui-consistency.md) — the two
   CI review agents. Their prompts are the enforced style guides for Effect services and
   web UI. Read the relevant one before a PR that touches either area.
3. `oxlint-plugin-t3code/rules/` — conventions that are machine-checked.
4. [.macroscope/approvability.md](../../.macroscope/approvability.md) — a PR that changes a
   product default, or that adds or broadens a directive suppressing a lint, type-checker, or
   LSP diagnostic, is never auto-approvable and needs human review.
5. This page and the rest of `docs/internals/`.

## Toolchain

- pnpm 11 workspace, Node `^24.13.1`, driven by `vp` (Vite+): `vp i`, `vp run dev`,
  `vp test run <files>`, `vp lint`, `vp fmt`. `vpr` is the recursive alias.
- Third-party versions come from the `catalog:` block in `pnpm-workspace.yaml`. Declare
  deps as `"catalog:"` (third-party) or `"workspace:*"` (internal). Never inline a version
  that the catalog already pins.
- Typecheck is `tsgo --noEmit` per package (`apps/mobile` still uses `tsc`).
- Format is Oxfmt via `vp fmt`; a staged hook formats on commit. No lint or typecheck on
  commit — that is on you and on CI.
- Do not run repo-wide `vp check`, `vp run -r test`, or `vp run -r typecheck`. Run the
  focused tests and the typecheck for the package you touched. CI owns the full suite.
- Dependency patches live in `patches/`. pnpm installs each patch hash at a new filesystem
  path, so after adding or changing one, restart Metro once with `vp run dev:client:reset`
  from `apps/mobile` and refresh CocoaPods before rebuilding an existing iOS project. A
  cached transform or an old Pods project otherwise keeps compiling the previous copy.

## TypeScript baseline

`tsconfig.base.json` shapes the code more than any style preference:

- `erasableSyntaxOnly` — no enums, no parameter properties, no namespaces.
- `verbatimModuleSyntax` — type-only imports are written `import type`.
- `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` — relative imports
  carry the `.ts` extension (`./decider.ts`). `apps/web` opts out of both and uses the
  `~/*` alias instead.
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `strict`.
- The `@effect/language-service` plugin escalates ~30 diagnostics to errors, including
  `importFromBarrel`, `leakingRequirements`, `missingEffectServiceDependency`,
  `preferSchemaOverJson`, `nodeBuiltinImport`, and the `global*` family. In server and
  shared code that means no `Date`, `console`, `Math.random`, `crypto.randomUUID`,
  `fetch`, or timers — use `DateTime`, `Effect.log*`, `Crypto`, `HttpClient`,
  `Effect.sleep`. `apps/web` turns the browser-global diagnostics off.

Prefer inferred types over annotations. `any` is the enemy.

## Repo-local lint rules

Defined in `oxlint-plugin-t3code/rules/`, configured from the root `vite.config.ts`:

| Rule                                     | What it enforces                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `namespace-node-imports`                 | Builtins are single namespace imports with canonical aliases: `NodeOS`, `NodeFSP`, `NodeChildProcess`, `NodeAssert`. No named or default builtin imports.                                                                                                                                   |
| `no-global-process-runtime`              | No `process.platform`/`arch` or `os.platform()`/`arch()`. Use `HostProcessPlatform`/`HostProcessArchitecture` so platform behavior is injectable and testable.                                                                                                                              |
| `no-inline-schema-compile`               | No `Schema.decode*`/`encode*`/`is`/`asserts` compiled inside a function body from a static schema. Hoist the compiled codec to module scope.                                                                                                                                                |
| `no-manual-effect-runtime-in-tests`      | No `Effect.runSync`/`runPromise`/`runFork` or `ManagedRuntime.make` in test files. Use `@effect/vitest` `it.effect` with test layers. A `LEGACY_BASELINE` grandfathers existing counts; net-new occurrences fail.                                                                           |
| `no-native-title-tooltip`                | No `title=` on intrinsic JSX elements. Use `Tooltip`/`TooltipTrigger`/`TooltipPopup`.                                                                                                                                                                                                       |
| `no-mobile-uniwind-theme-escape-hatches` | In `apps/mobile/src`: no `useThemeColor`, no `uniwind`'s `useCSSVariable` (it adds a React theme subscription), no `dark:`/`light:` utilities (they ignore registered custom themes), and `useUniwindTheme` only from the reviewed native-interop allowlist. Use adaptive semantic classes. |

`eslint/no-restricted-imports` also bans the `@t3tools/client-runtime` package root and
`CodeView` from `@pierre/diffs/react`.

A directive that disables or suppresses any static-analysis diagnostic — lint, type-checker,
or LSP, at file, line, or configuration level — carries an adjacent comment saying why that
diagnostic has to be off there. The directive is not its own explanation: the Effect service
review agent reports a missing reason as a violation, and the PR loses auto-approval.

## Imports and package boundaries

- Effect is always imported as a subpath namespace: `import * as Effect from "effect/Effect"`,
  `import * as Layer from "effect/Layer"`. Never from the `effect` barrel.
- Local service modules are imported as namespaces at a service boundary, so call sites
  read `WorkspacePaths.WorkspacePaths`, `WorkspacePaths.make`, `WorkspacePaths.layer`. Do
  not alias `layer` into `workspacePathsLayer`.
- Namespace imports are not a blanket rule: keep named imports for `@t3tools/contracts`
  and for modules used only for a pure helper, error, schema, or type.
- `@t3tools/shared` and `@t3tools/client-runtime` have no barrel and no root export.
  Import the narrow subpath (`@t3tools/shared/DrainableWorker`,
  `@t3tools/client-runtime/state/threads`). Files that are not exported are internals.
- `@t3tools/contracts` does export a root, alongside `./settings` and `./relay`.
- Dependency direction is one-way: `contracts` → nothing but `effect`; `shared` →
  `contracts`; `ssh`/`tailscale`/`client-runtime` → `contracts` + `shared`; apps and
  `infra/relay` on top. `effect-acp` and `effect-codex-app-server` stay standalone.
- Nothing imports from `.repos/` and nothing edits it. It is vendored, read-only
  reference. `.repos/effect-smol/LLMS.md` is the pre-read before writing Effect code.

## Server (`apps/server`)

Structure is `Services/X.ts` (pure interface `XShape` + `Context.Service` tag, type-only
Effect imports) paired with `Layers/X.ts` (`makeX` as an `Effect.gen`, then
`export const XLive = Layer.effect(X, makeX)`), composed in `*/runtimeLayer.ts`. Newer
service modules may live in one canonical file in the order: imports, errors/schemas,
`Context.Service` tag with inline interface, `make`, `layer` — see the Effect service
review prompt, which is authoritative when older code differs.

- Services are `Context.Service`, never `Effect.Service`. Tag ids are namespaced strings
  such as `"t3/orchestration/Services/RuntimeReceiptBus"`.
- Errors are `Schema.TaggedErrorClass` with structured attributes and an
  `override get message()` derived from those attributes — never from `cause.message`.
  Preserve the underlying failure as `cause`. Catch with `Effect.catchTags`.
- Effect-returning functions are `Effect.fn("name")` with an explicit return annotation.
- Dependencies are acquired from the environment (`yield* Foo.Foo`), not passed in as
  service instances. `ManagedRuntime.make` and `runPromise` belong only at application
  boundaries (React, native callbacks, CLI, HTTP).
- Layer exports end in `Live`; test doubles end in `Test`; interfaces end in `Shape`.
- `PascalCase.ts` for service/layer/class modules, `camelCase.ts` for function modules.
  Large adapter and transport files are fine; the pure core is not allowed to grow I/O.

### The pipeline

Client RPC → `apps/server/src/ws.ts` handler → `normalizeDispatchCommand` →
`OrchestrationEngine.dispatch`. The engine serializes every command through one queue and
one worker fiber, so command handling is totally ordered. Per envelope it checks the
durable receipt for idempotency, runs the pure `decider.ts`, then in a single SQL
transaction appends events, applies them to the in-memory read model via `projector.ts`,
projects them into tables via `ProjectionPipeline`, and writes the receipt.

- `decider.ts` is pure. No I/O, no attribution stamping (the engine owns `metadata.origin`).
- Commands and events live in `packages/contracts/src/orchestration.ts` before anything
  else. New event payload fields are `Schema.optional` so persisted history still decodes.
- Follow-up work runs in `DrainableWorker`-backed reactors — `ProviderRuntimeIngestion`,
  `ProviderCommandReactor`, `CheckpointReactor` — each exposing `drain`.
- `RuntimeReceiptBus` is test-only; the production layer publishes nothing. Never build
  product behavior on receipts.
- Turn completion is `settledTurnStateForSessionStatus` in `projector.ts`. Checkpoint work
  settling later does not define turn end.

### Persistence

One SQLite file per environment at `<baseDir>/userdata/state.sqlite` (`dev/` when a dev URL
is set). Migrations are numbered modules `persistence/Migrations/NNN_Name.ts`, statically
registered in `Migrations.ts`. Append the next number; never edit a shipped migration. A
data migration gets its own test.

### Provider drivers

A driver is a plain value, not a service, because several instances of one driver coexist:
`{ driverKind, metadata, configSchema, defaultConfig, create }`. `create` owns all
per-instance state, releases it with the registry's child scope, and must not throw
defects. Adapters implement `ProviderAdapterShape` (`startSession`, `sendTurn`,
`interruptTurn`, `respondToRequest`, `streamEvents`, …). Register in `BUILT_IN_DRIVERS`
and add the env to `BuiltInDriversEnv`. Adding a driver needs no orchestration, contract,
or client change.

## Contracts (`packages/contracts`)

Everything on the wire is Effect Schema. RPC methods are declared in a flat `WS_METHODS`
map (camelCase key → dotted wire string), one `Rpc.make` per method, all assembled into
`WsRpcGroup`. Streaming members set `stream: true`.

Adding a message end to end:

1. Define `XInput`/`XResult` and any `Schema.TaggedErrorClass` in the domain file.
2. Add the method to `WS_METHODS`, add `export const WsXRpc = Rpc.make(...)`, add it to
   the group.
3. Server: add the handler in `apps/server/src/ws.ts` wrapped in `observeRpcEffect`, and
   add the scope in `auth/RpcAuthorization.ts` — omitting it is a compile error, and a
   test asserts key-set equality. An authenticated socket is not authorization.
4. Client: consume it through `packages/client-runtime` state atoms, never by building an
   RPC client in a component.

Compatibility lives in the schema, not in runtime branches: `ForwardCompatibleArray` drops
undecodable members, new fields are `Schema.optional` or carry a decoding default, and
shape migrations are pre-decode transforms. `ProviderDriverKind` is an open branded slug
so forks and unknown drivers still parse.

## Web (`apps/web`)

React 19 with the React Compiler enabled — do not add defensive `useMemo`/`useCallback`.
TanStack Router file-based routes; `routeTree.gen.ts` is generated. Named exports only,
`PascalCase.tsx` components, heavy logic extracted to a sibling `Component.logic.ts` with
`Component.logic.test.ts` — testing the logic module rather than the DOM is the norm.

- Styling is Tailwind v4, CSS-first. Tokens live in `src/index.css` under `@theme`; there
  is no `tailwind.config`. Use semantic token classes, never raw hex. Theme-only rules use
  `@variant dark` / `@variant light`.
- Prefer the primitives in `src/components/ui` (Base UI, shadcn-style, `cva` + `cn` +
  `data-slot`) over native controls or local reconstructions. If several call sites repeat
  the same geometry, add a named variant instead of overriding the primitive's height,
  radius, focus ring, or hit target at the call site.
- State has three tiers: Effect Atoms for anything server-derived (one `AtomRegistry`,
  factories from `client-runtime`), zustand for local and persisted UI state (versioned
  keys with legacy migration), `useSyncExternalStore` for browser-owned state.
- Long lists are virtualized with `@legendapp/list`. `ScrollArea` owns its viewport; a
  virtualized list owns a native scroller and uses the shared virtualized-scroll-fade
  contract.
- No continuously repainting animations. Keyframes are duty-cycled with `steps()`;
  transform-only where possible. Persist on pointer-up, not per frame.
- Contrast and accessibility settings derive from semantic colour tokens. Never apply a
  `filter` to `html`, `body`, or the app root — it also hits user media, previews,
  terminals, glass backdrops, and view-transition snapshots. Runtime-adjusted roles stay
  ordinary custom properties shared by the Tailwind bridge, global CSS, imperative style
  strings, and bridge snapshots, so nothing splits into adjusted and unadjusted colours.
- A shared renderer that performs an environment-scoped action — a server RPC such as
  opening or revealing a file, a capability check, an OS-derived label — resolves its
  target from explicit scope: the bound thread's `environmentId`, or an `environmentId`
  prop threaded from the owning surface. Never fall back to the globally active
  environment. Multi-environment surfaces can render environment B's content while A is
  active, and a silent fallback sends B's paths to A's server. If a call site cannot
  supply scope, suppress the action there rather than guessing.

## Desktop (`apps/desktop`)

Electron main is a pure Effect program: `Context.Service` modules composed as layers and
run through `NodeRuntime`. The renderer is `apps/web` unchanged, loaded over the
`t3code://` protocol in production. Preload exposes one `desktopBridge`, whose shape is
typed by `DesktopBridge` in `@t3tools/contracts` so web and desktop cannot drift. A new
bridge method means: contracts type, channel constant in `ipc/channels.ts`, handler in
`ipc/methods/`, preload delegate, and a graceful web fallback (`isElectron` is false on
web and mobile).

## Mobile (`apps/mobile`) and client runtime

Expo SDK 57 with a dev client and prebuild; `ios/` and `android/` are generated, never
edited. Config is `app.config.ts` with three `APP_VARIANT` installs. Navigation is React
Navigation 7's static API, with the single route table in `src/Stack.tsx`. Styling is
uniwind (Tailwind for RN) with compiled semantic themes; use `className` and `cn()`, not
`StyleSheet` or hex. Theme access is lint-enforced: no `useThemeColor`, no
`useCSSVariable`, no `dark:`/`light:` utilities, and `useUniwindTheme` only from the
allowlisted native-interop boundaries — a semantic token is the answer in ordinary UI.
Native iOS behavior is subtle and documented in
[mobile-navigation.md](./mobile-navigation.md): headers and the brand title slot,
`ControlPillMenu` for semantic menu icon colors, and the `PresentationSource` registry that
anchors AVKit, Quick Look, and the share sheet. Let the native presenter own its transition
rather than layering `preferredTransition` or a custom animator over it. Fast Refresh and the
hot-update boundaries around the connection runtime, atom registry, and uniwind patch are in
[mobile-development.md](./mobile-development.md). Platform differences go in
platform-extension files first, then `Platform.OS`.

`packages/client-runtime` owns every non-visual client concern — connection lifecycle,
authorization, RPC session, environment registry, Atom domain state. Apps supply the
`platform` layer and the UI. App code must not construct transports, retry loops, or RPC
clients. RN-only APIs must never enter `client-runtime`.

[voice-input.md](./voice-input.md) is the worked example of that boundary. The shared
`VoiceInputController` owns preparation, recording, transcription, cancellation, and insertion
into the captured draft selection while importing neither React Native nor an Apple API; capture
and native recognition stay in the app. It also fixes the rules for adding transcription
services: credentials belong to the environment and never reach a client, a service ID is
meaningful only within its environment, and remote support is opt-in behind an
`ExecutionEnvironmentCapabilities` check so older servers simply expose no choices.

Mobile is multi-environment by construction: it pairs explicitly (typed URL or QR) and has
no implicit local environment, so every feature needs an unpair/offline story. Changes
under `apps/mobile`, `packages/{client-runtime,contracts,shared}`, `scripts`, or `patches`
are fingerprint-checked in CI because they can silently break OTA reach.

## Testing

- Vitest through `vp test run <files>`. Tests are colocated `*.test.ts(x)`; server
  integration suites live in `apps/server/integration/*.integration.test.ts` with `*.integration.ts`
  harnesses.
- Import from `@effect/vitest` (`it.effect`) or `vite-plus/test`, never bare `vitest`.
- Never sleep or poll. Await `worker.drain()`, a receipt, or a harness `waitFor*`. A test
  that needs a timeout to pass is wrong.
- `apps/server` runs with `fileParallelism: false`; sqlite, git, and worktrees are
  load-sensitive.
- Use test layers for external services only. Do not mock core business logic.
- Backend behavior changes ship with focused tests. Mechanical refactors do not need new
  tests.

## Before you call a change done

Walk the surface checklist in [AGENTS.md](../../AGENTS.md): entry points, clients
(web/desktop/mobile), the five providers, contracts, reverse states, connection modes,
docs. Then state which entries applied.

Docs split by audience: user-visible behavior in `docs/user/` (shipped-product voice, no
repo paths), architecture and contributor material in `docs/internals/`, runbooks in
`docs/operations/`, new vocabulary in [glossary.md](./glossary.md). Analytics events have
their own contract in [product-analytics.md](./product-analytics.md) — client events carry
the metadata of the WebSocket connection that caused them, not a server-global current
client.
