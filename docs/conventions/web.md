---
kind: intent
---

# Web conventions

Rules for `packages/web`, on top of the [general conventions](general.md).

## Files and imports

- Relative imports only reach the same folder or a folder below it, never `../`. Everything else uses the `@/` alias.
- Hand-written component files are PascalCase, and other modules are kebab-case.
- Never rename a file the shadcn CLI generated. That covers `components/ui/*` and the blocks in `components/`. They keep their kebab-case names.

## Components

- Hand-written UI lives in its feature folder (`auth/`, `shell/`, `health/`), next to what uses it. Route pages are thin. Shadcn blocks stay in `components/`, and the feature's page wraps them.
- Build UI from `@/components/ui/*` (shadcn, style `base-nova`, lucide icons). Add components only with the shadcn CLI and never hand-edit the generated files (lint ignores them). The CLI also adds the `cn` npm package, so a Ticket that adds a component needs it in Allowed packages.
- Style only with Tailwind classes in `className`. No `style={{}}` outside ui components. Only ui components use `cn()`.
- Before sending a form, `safeParse` its input with the contracts schema.

## Data fetching

- Put one function per endpoint in `api/<resource>.ts`, using plain `fetch`. Parse success bodies with the contracts schema, map `ErrorCode` to user-facing text, and return an `{ ok, ... }` union. Never throw to components.
- Components make authenticated calls only through `useAuth()`, which adds the access token. Calls to public endpoints (health, register) may import `@/api/*` directly.
- Async effects use an `AbortController`, check `signal.aborted` before setting state, and abort on cleanup.

## State and hooks

- State is local `useState` plus context providers (Auth, Realtime, Theme). Use no query or state library. Only `ThemeProvider` uses `localStorage`.
- A custom hook lives in its provider's file (`useAuth`, `useTheme`, `useRealtimeEvents`). `hooks/` holds only shadcn's `use-mobile.ts`.

## Routing and realtime

- Routing is react-router's `BrowserRouter` in `App.tsx`, with guards as layout routes (`RequireSignedIn`, `SignedOutOnly`). The open Conversation is the URL (`/conversations/:id`); a Direct view with no Conversation yet is `/direct/:userId`, replaced by `/conversations/:id` once the first Message exists.
- Components get pushed events only through the `RealtimeProvider` hooks: `useRealtimeEvents`, `useConnectionStatus` and `useReconnected`. Events are parsed with the contracts event schemas.

## Tests

Tests render `<App />` with Testing Library and stub the network with MSW (`server.use`). Default handlers, setup and the fake realtime for pushed events are in `src/test/`.
