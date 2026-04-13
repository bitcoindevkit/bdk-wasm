import { WalletDemo } from "./components/wallet-demo";

export default function Home() {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "56rem",
        padding: "3rem 1.5rem",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1>bdk-wasm Next.js example</h1>
      <p>
        This page stays server-rendered while the wallet module loads only in a
        client component.
      </p>
      <WalletDemo />
    </main>
  );
}
