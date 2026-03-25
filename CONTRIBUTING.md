# Contributing to StellarPassKey

Thanks for your interest in contributing! Here's how to get set up.

## Development Setup

### Prerequisites

- Rust (latest stable) + `wasm32-unknown-unknown` target
- Soroban CLI
- Node.js 20+
- npm

### Clone and Install

```bash
git clone https://github.com/stellar-passkey/stellar-passkey.git
cd stellar-passkey

# Rust contract
cargo build

# SDK
cd sdk && npm install

# Reference app
cd ../app && npm install
```

## Running Tests

```bash
# Contract tests
cargo test

# SDK tests
cd sdk && npm test
```

## Code Style

| Language | Convention |
|----------|-----------|
| Rust | `rustfmt` defaults, `cargo clippy` clean |
| TypeScript | `strict: true`, no `any` types, named exports only |
| React | Functional components, hooks, CSS modules |
| Naming | `snake_case` for Rust, `camelCase` for TypeScript |

## Pull Request Process

1. Fork the repo and create a feature branch
2. Write tests for all new functionality
3. Ensure `cargo test` and `npm test` pass
4. Update documentation if adding/changing APIs
5. Submit a PR with a clear description

## Project Structure

| Directory | Who owns it |
|-----------|------------|
| `contracts/` | Rust/Soroban engineers |
| `sdk/` | TypeScript SDK team |
| `app/` | Frontend / demo |
| `docs/` | Everyone — documentation is a first-class citizen |

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license.
