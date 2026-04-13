# Examples

This directory contains small, focused examples for the published
`bdk-wasm` JavaScript packages.

## Included examples

- [`browser-vite`](./browser-vite) — vanilla JavaScript + Vite in the browser
- [`node-wallet`](./node-wallet) — Node.js + Esplora full scan, PSBT signing,
  and transaction broadcast
- [`nextjs`](./nextjs) — client-side loading pattern for Next.js / React apps

## Safety note

The browser and Next.js examples embed throwaway demo descriptors so the code
works out of the box. Those descriptors are for documentation only.

Do **not** ship private descriptors, seeds, or xprvs inside browser bundles or
React apps in production. For production:

- use public descriptors client-side when possible
- keep signing in a secure backend or hardware signer flow
- persist wallet state outside the WASM module using the exported `ChangeSet`

## Picking the right example

- Start with [`browser-vite`](./browser-vite) if you want the smallest browser
  setup and only need local wallet operations.
- Start with [`node-wallet`](./node-wallet) if you want a scriptable backend,
  job worker, or service that talks to Esplora.
- Start with [`nextjs`](./nextjs) if you are integrating `bdk-wasm` into a
  React application with server-side rendering in the stack.

Each example README lists the exact commands needed to bootstrap a fresh app
and copy the sample files over.
