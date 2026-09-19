# Jever

A personal desktop workspace for [TypeSafe Jev](https://openrouter.ai/~typesafe/jev-latest), built with pnpm, Electron, TypeScript, React, and Tailwind CSS.

The original generated concept is preserved in [design](design/README.md). The current interface uses a minimal conversation layout with question controls inside the composer.

## Run

Use Node.js 22.12+ (tested with Node 25) and pnpm 9.9+.

```sh
pnpm install
pnpm dev
```

For a production build:

```sh
pnpm build
pnpm start
```

The locally packaged Apple Silicon app is `release/mac-arm64/Jever.app`. It uses ad-hoc signing for local use. Public distribution requires your own signing and notarization setup.

Open **Settings → Connection**, add an OpenRouter API key, and save. An OS keychain is required. Your account needs access to the Jev model and sufficient OpenRouter credits.

For a browser-only UI preview, run `pnpm dev:web` and open `http://127.0.0.1:5173`. Live requests and credentials are deliberately available only in Electron. The preview uses a separate local browser workspace.

## What Jev can do

Jev is a typed decision model, not a prose-generating chat model. Jever provides a familiar conversation interface for **Choice**, **Score**, and **Noul** decisions. It does not invent a chat response, switch to another model, or emulate unsupported streaming, voice, image analysis, or web search.

Every live request goes to `https://openrouter.ai/api/alpha/decisions`, with `model: "~typesafe/jev-latest"`. OpenRouter resolves that alias to the current Jev version. Model fallbacks are disabled.

1. Click **Questions** inside the message bar. Write a question or choose a starter from **Presets**.
2. Define choices, ordered score levels, or a yes/no condition.
3. Paste the context or attach text files, then run the decision.
4. Read the answer. Expand **Details** for probabilities, usage, and response JSON.

The built-in example is a labeled, local illustration adapted from OpenRouter's documented response. It does not call the API. Example usage figures belong to that documentation example.

## Customization

- Multiple independent questions in a single request; up to 50 questions per recipe.
- A visual builder for Choice options, Score rubrics, and Noul criteria.
- JSON editing for custom question IDs and structured instructions or criteria.
- Saved recipe presets and three starter workflows.
- Persistent background context and optional conversation history.
- Review thresholds. Choice and Score use the provider's reported confidence. Noul uses the probability of its yes/no verdict, not an invented confidence value. Low-confidence results remain visible.
- Text, Markdown, JSON, CSV, and source-code attachments: up to five files, each under 100 KB, with 100,000 total characters. Combined request limit: 120,000 characters. This conservative character limit does not guarantee a request fits Jev's token limit for every language or dataset.
- Light, dark, or system theme; rose, sage, or blue accents; message text size.
- Enter-to-send preference, configurable timeout, and private provider routing.
- Search, pin, rename, delete, and export conversations. Export/import complete workspace backups.
- Keyboard shortcuts: Cmd/Ctrl+N for a new conversation, Cmd/Ctrl+K for search, Cmd/Ctrl+, for settings. Shift+Enter inserts a newline.

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

Native launch and persisted conversations were tested on macOS Apple Silicon. Browser checks cover desktop and 390px layouts, dark mode, preset creation, missing-key handling, JSON errors, and rubric editing. No authenticated inference was performed because no OpenRouter key was supplied. Windows/Linux packaging and code signing for public distribution are not verified.

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
