# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue:

- Use GitHub's **Report a vulnerability** button on the Security tab of this repository, or
- Contact [@aaron-samuvel](https://github.com/aaron-samuvel) directly.

Include steps to reproduce, the affected deployment (live demo / self-hosted demo backend / Spring Boot backend), and any crafted input the parser mishandles.

## Scope notes

- The **live demo** is a static, browser-only build: ledger data lives in your browser's localStorage and never leaves your device.
- The **demo Next.js backend** is meant for local development; do not expose it to the public internet as-is.
- The **Spring Boot backend** (`mini-services/udhaar-backend`) uses JWT auth with multi-shop tenancy. Report anything that breaks shop isolation or lets a caller read another shop's ledger.

## Supported versions

Only the latest `main` branch is supported.
