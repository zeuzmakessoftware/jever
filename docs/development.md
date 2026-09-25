# Development notes

## Data and security

The renderer is sandboxed with context isolation and no Node integration. A narrow preload bridge validates sender frames, origins, request shapes, and response shapes. Remote navigation and unexpected permissions are denied. Packaged pages use the `jever://app` protocol and a content security policy. External links are restricted to a fixed allowlist of destinations.

The API key is encrypted using Electron `safeStorage` and stays in the main process. It is never included in exports, logs, browser storage, or renderer responses. Linux's unencrypted `basic_text` backend is rejected. OpenRouter requests use a fixed HTTPS endpoint. Ollaya uses a validated HTTP(S) server URL; URL credentials, query strings, and fragments are rejected. Redirects are refused. Ollaya credentials are encrypted separately in `ollaya-credentials.bin` and keyed by normalized server URL, so changing servers never forwards an existing key to a different address. The original OpenRouter `credential.bin` remains compatible.

Conversation data and settings are stored locally as `workspace.json` in Electron's Jever user-data folder (`~/Library/Application Support/Jever` on macOS). These conversation files and exported backups are **not encrypted**. Input, attachments, background context, and optionally history are sent to the selected provider when you run a decision. Ollaya uses `POST /api/decide` for decisions (including routing, timings, and truncation metadata) and `GET /v1/models` for installed-model discovery. No model downloads happen implicitly. Private routing requests providers that decline data collection; it can reduce availability.

Writes are serialized and use atomic replacement. Invalid saved data produces a recovery error instead of being silently overwritten. Interrupted requests can be retried. The model's results should be reviewed in context; the threshold is a UI review flag and does not execute external actions.

## Development and verification

```sh
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm package       # local application bundle
pnpm dist          # distributable for the current platform
```

The Vitest suite covers Ollaya mixed decisions, optional auth, model discovery, URL validation, model limits, errors, metadata persistence, legacy workspace migration, OpenRouter model/endpoint locking, input validation, mixed question batches, transport headers, cancellation, missing keys, provider errors, malformed answers, confidence semantics, backup validation, and native renderer URL restrictions.

During initial implementation, native launch and persisted conversations were tested on macOS Apple Silicon. Browser checks cover desktop and 390px layouts, dark mode, preset creation, missing-key handling, JSON errors, and rubric editing. Those initial checks did not include authenticated inference. Windows/Linux packaging and code signing for public distribution are not verified.

To isolate native smoke-test data:

```sh
JEVER_USER_DATA=/tmp/jever-smoke pnpm start
```

## Project layout

- `src/main`: desktop window, encrypted credentials, persistence, OpenRouter and Ollaya transports.
- `src/preload`: typed IPC bridge.
- `src/shared`: request/response schemas, settings, workspace types, and decision semantics.
- `src/renderer`: React interface, Tailwind integration, and local fonts.
- `tests`: protocol, transport, validation, and security tests.
- `design`: the AI-generated concept produced before implementation.

## Ollaya integration verification

The Ollaya contract was checked against its official API reference on September 25, 2026. Transport tests use documented response fixtures; these do not establish inference quality or hardware compatibility. An isolated Electron smoke test against a local fixture server verified model discovery, keyless decisions, persisted results, and the truncation warning. Browser checks covered desktop and 390px settings layouts, provider switching, URL validation, and timeout controls. Live inference was subsequently verified on macOS against Ollaya 0.6.0 with the installed Laya router, which selected `laya:en`. Native model discovery, a real choice decision, and inference after restarting with the normal workspace all succeeded. Other model families and hardware configurations have not been verified.

Ollaya settings live under `settings.connection` (`provider`, `baseUrl`, `model`). Old version-1 workspaces default to OpenRouter without needing a migration. Secrets never appear in that object. The renderer cannot retrieve saved secrets and performs no direct inference requests. Cancellation and request timeouts use the existing main-process abort controller; discovery has a separate 10-second deadline.

Jever uses explicit questions on every request, including for models with built-in Modelfile questions. Model installation and management stay in the Ollaya CLI. The native response's `state_truncated` warning is shown above the answers and preserved in backups.

## Sources

The implementation was checked against the public documentation on September 18, 2026:

- [Ollaya API reference](https://ollaya.dev/docs/api)
- [Ollaya TypeSafe compatibility](https://ollaya.dev/docs/typesafe-compatibility)
- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe primitives](https://docs.typesafe.ai/primitives)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [OpenRouter's current API schema](https://openrouter.ai/openapi.json), including `POST /api/alpha/decisions`
- [Jev latest alias](https://openrouter.ai/~typesafe/jev-latest)
- [Typesafe visual reference](https://typesafe.ai/)

Jever is an independent application, inspired by Typesafe's imagery. It is not an official TypeSafe or OpenRouter product.
