#!/usr/bin/env bash
set -euo pipefail

# Release assets and SHA-256 digests from wasm-bindgen/wasm-pack v0.15.0.
version=0.15.0
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    target=x86_64-unknown-linux-musl
    checksum=c09f971ecaed9a2efc80fdcea7a00ef6b53c7fadc8c57d1f61b53a6aa66b668a ;;
  Linux-aarch64)
    target=aarch64-unknown-linux-musl
    checksum=e17ef0806381c3a0acb9c9ddad643a49facaa5a2ecf657a421d4d8f3357a24b7 ;;
  Darwin-arm64)
    target=aarch64-apple-darwin
    checksum=0abff4a03d670b6c00ea31d0e1608a72407e355f3d3765e9c30eb45cd5b7e318 ;;
  Darwin-x86_64)
    target=x86_64-apple-darwin
    checksum=d3f1a4a33e95f8f0d7801b024e08624c479999ac96aa150908b2394015cd0363 ;;
  *) echo "Unsupported wasm-pack platform" >&2; exit 1 ;;
esac

temporary_dir=$(mktemp -d)
trap 'rm -rf "$temporary_dir"' EXIT
archive="$temporary_dir/wasm-pack.tar.gz"
release="wasm-pack-v$version-$target"
curl --fail --silent --show-error --location \
  "https://github.com/wasm-bindgen/wasm-pack/releases/download/v$version/$release.tar.gz" \
  --output "$archive"
if command -v sha256sum >/dev/null; then
  printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check -
else
  printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 --check -
fi
tar -xzf "$archive" -C "$temporary_dir" "$release/wasm-pack"
install_dir="${WASM_PACK_INSTALL_DIR:-${CARGO_HOME:-$HOME/.cargo}/bin}"
mkdir -p "$install_dir"
install -m 755 "$temporary_dir/$release/wasm-pack" "$install_dir/wasm-pack"
"$install_dir/wasm-pack" --version
