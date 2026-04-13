# Browser example with Vite

This example shows the smallest browser setup for
`@bitcoindevkit/bdk-wallet-web` using vanilla JavaScript and Vite.

It creates a demo signet wallet in the browser and renders:

- the network
- the first derived address
- the next revealed address
- the public external descriptor

## 1. Create a fresh Vite app

```sh
npm create vite@latest browser-vite -- --template vanilla
cd browser-vite
npm install
npm install @bitcoindevkit/bdk-wallet-web
```

## 2. Replace the generated files

Copy the sample files from this directory into the fresh Vite app:

- `index.html`
- `src/main.js`

## 3. Start the dev server

```sh
npm run dev
```

## Notes

- The descriptors in `src/main.js` are throwaway demo descriptors copied from
  the repository test fixtures.
- This example intentionally avoids syncing against Esplora so it stays focused
  on local wallet initialization in a browser context.
- In production, never embed real xprvs or seed material in client-side code.
