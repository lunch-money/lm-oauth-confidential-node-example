# Contributing

Before proposing a change, run `npm run check`. Keep the OAuth teaching path compact, framework-independent, and covered by descriptive tests. Do not add secrets, tokens, personal data, private hostnames, raw provider bodies, plaintext credential logging, or unpublished protocol claims.

Changes to OAuth behavior must update the corresponding source JSDoc/security invariant, focused test, root walkthrough, and relevant supporting document. Refresh changes must preserve the documented rotation, serialization, atomic replacement, and terminal recovery contract.

## Keep the Developer Portal walkthrough synchronized

`docs/WALKTHROUGH.md` is the canonical source for the shared hands-on walkthrough published in the Lunch Money Developer Portal. Changes to that file on `main` trigger `.github/workflows/sync-developer-docs-walkthrough.yml`, which checks out the synchronization logic from `lunch-money/developer-docs`, validates the sample revision, and opens a pull request containing the updated source pin and generated Markdown. While OAuth documentation remains in preview, these pull requests target the `v2.11.2` branch; maintainers should update the workflow to target `main` when the OAuth documentation is promoted.

The workflow requires a fine-grained `DEVELOPER_DOCS_PR_TOKEN` Actions secret with access only to `lunch-money/developer-docs` and permission to read and write repository contents and pull requests. It does not publish documentation or merge its pull request.

For contribution questions, email [dev-support@lunchmoney.app](mailto:dev-support@lunchmoney.app) or ask in the [developers channel on Discord](https://discord.com/channels/842337014556262411/1134594318414389258). [Join the Lunch Money Discord](https://lunchmoney.app/discord) if needed. Report security concerns privately by email rather than in Discord or a public issue.

Contributions are licensed under the repository's [MIT License](LICENSE).
