# Development Cycle

This project uses [Semantic Versioning], but is currently at MAJOR version zero (0.y.z) meaning it is still in initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable. Until we reach version `1.0.0` we will do our best to document any breaking API changes in the changelog info attached to each release tag.

We decided to maintain a faster release cycle while the library is still in "beta", i.e. before release `1.0.0`: since we are constantly adding new features and, even more importantly, fixing issues, we want developers to have access to those updates as fast as possible.

Once the project reaches a more mature state (>= `1.0.0`), we will very likely switch to longer release cycles.

Prepare a release PR updating `Cargo.toml`, the root package version in `Cargo.lock`,
and the dated release section in `CHANGELOG.md`. Required CI uses funded local regtest;
the optional `signet-smoke.yml` workflow checks a public Esplora server without funds.

Before merging, check the trusted publisher settings for both npm packages:
`@bitcoindevkit/bdk-wallet-web` and `@bitcoindevkit/bdk-wallet-node`. They must authorize
GitHub repository `bitcoindevkit/bdk-wasm`, calling workflow **`main.yml`** (not the
reusable `publish-release.yml`), environment `npm-publish`, and direct `npm publish`.
Create or renew expired configurations close to the release: npm currently requires
the first successful publish within two days. See [npm trusted publishing].

Merging a version bump into `main` starts the release workflow after required CI passes.
It builds both packages and runs `npm publish --dry-run`, then waits for approval of
the `npm-publish` environment before publishing. Dry runs verify package contents,
not OIDC authorization. Leave that environment unapproved until ready to publish.
The workflow does not create a Git tag or GitHub release; the release manager creates
those for the published version and commit afterward.

[used by the Rust language]: https://doc.rust-lang.org/book/appendix-07-nightly-rust.html
[Semantic Versioning]: https://semver.org/
[npm trusted publishing]: https://docs.npmjs.com/trusted-publishers/
