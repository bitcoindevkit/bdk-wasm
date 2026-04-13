# Next.js example

This example shows the recommended loading pattern for
`@bitcoindevkit/bdk-wallet-web` inside a Next.js app:

- keep the page itself server-rendered
- load the WASM package only inside a client component
- initialize the module inside `useEffect`

## 1. Create a new app

```sh
npx create-next-app@latest nextjs-bdk-demo --ts --app
cd nextjs-bdk-demo
npm install @bitcoindevkit/bdk-wallet-web
```

## 2. Copy the sample files

Copy these files into the generated project:

- `app/page.tsx`
- `app/components/wallet-demo.tsx`

## 3. Start the app

```sh
npm run dev
```

## Why this pattern matters

`@bitcoindevkit/bdk-wallet-web` is a browser-side WASM package. Importing it at
module scope in a server component can break SSR builds. Dynamic importing it
inside a `"use client"` component keeps the boundary explicit and reliable.

The sample uses demo signet descriptors for illustration only. Replace them
with your own safe integration strategy before shipping anything real.
