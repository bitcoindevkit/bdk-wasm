"use client";

import { useEffect, useState } from "react";

const demoDescriptors = {
  external:
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd",
  internal:
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74",
};

type WalletState = {
  network: string;
  firstAddress: string;
  publicDescriptor: string;
};

export function WalletDemo() {
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWallet() {
      try {
        const { default: init, Wallet } = await import(
          "@bitcoindevkit/bdk-wallet-web"
        );

        await init();

        const wallet = Wallet.create(
          "signet",
          demoDescriptors.external,
          demoDescriptors.internal
        );

        if (cancelled) {
          return;
        }

        setWalletState({
          network: wallet.network,
          firstAddress: wallet.peek_address("external", 0).address.toString(),
          publicDescriptor: wallet.public_descriptor("external"),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    loadWallet();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p style={{ color: "#b00020" }}>
        Failed to load bdk-wasm: {error}
      </p>
    );
  }

  if (!walletState) {
    return <p>Loading wallet module...</p>;
  }

  return (
    <section
      style={{
        marginTop: "2rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "1.5rem",
      }}
    >
      <h2>Wallet details</h2>
      <p>
        <strong>Network:</strong> {walletState.network}
      </p>
      <p>
        <strong>First external address:</strong> {walletState.firstAddress}
      </p>
      <p>
        <strong>Public descriptor:</strong>
      </p>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "#f8fafc",
          padding: "1rem",
          borderRadius: "0.5rem",
        }}
      >
        {walletState.publicDescriptor}
      </pre>
    </section>
  );
}
