# Development notes

## Data and security

The renderer is sandboxed with context isolation and no Node integration. A narrow preload bridge validates sender frames, origins, request shapes, and response shapes. Remote navigation and unexpected permissions are denied. Packaged pages use the `jever://app` protocol and a content security policy. External links are restricted to three fixed destinations.

The API key is encrypted using Electron `safeStorage` and stays in the main process. It is never included in exports, logs, browser storage, or renderer responses. Linux's unencrypted `basic_text` backend is rejected. API requests use the fixed OpenRouter HTTPS endpoint.

Conversation data and settings are stored locally as `workspace.json` in Electron's Jever user-data folder (`~/Library/Application Support/Jever` on macOS). These conversation files and exported backups are **not encrypted**. Input, attachments, background context, and optionally history are sent to OpenRouter when you run a decision. Private routing requests providers that decline data collection; it can reduce availability.

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

The Vitest suite covers model/endpoint locking, input validation, mixed question batches, transport headers, cancellation, missing keys, provider errors, malformed answers, confidence semantics, backup validation, and native renderer URL restrictions.

During initial implementation, native launch and persisted conversations were tested on macOS Apple Silicon. Browser checks cover desktop and 390px layouts, dark mode, preset creation, missing-key handling, JSON errors, and rubric editing. Those initial checks did not include authenticated inference. Windows/Linux packaging and code signing for public distribution are not verified.

To isolate native smoke-test data:

```sh
JEVER_USER_DATA=/tmp/jever-smoke pnpm start
```

## Project layout

- `src/main`: desktop window, encrypted credentials, persistence, fixed OpenRouter transport.
- `src/preload`: typed IPC bridge.
- `src/shared`: request/response schemas, settings, workspace types, and decision semantics.
- `src/renderer`: React interface, Tailwind integration, and local fonts.
- `tests`: protocol, transport, validation, and security tests.
- `design`: the AI-generated concept produced before implementation.

## Sources

The implementation was checked against the public documentation on September 18, 2026:

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe primitives](https://docs.typesafe.ai/primitives)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [OpenRouter's current API schema](https://openrouter.ai/openapi.json), including `POST /api/alpha/decisions`
- [Jev latest alias](https://openrouter.ai/~typesafe/jev-latest)
- [Typesafe visual reference](https://typesafe.ai/)

Jever is an independent application, inspired by Typesafe's imagery. It is not an official TypeSafe or OpenRouter product.
