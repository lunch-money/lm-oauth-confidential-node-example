# Contributing

Before proposing a change, run `npm run check`. Keep the OAuth teaching path compact, framework-independent, and covered by descriptive tests. Do not add secrets, tokens, personal data, private hostnames, raw provider bodies, plaintext credential logging, or unpublished protocol claims.

Changes to OAuth behavior must update the corresponding source JSDoc/security invariant, focused test, root walkthrough, and relevant supporting document. Refresh changes must preserve the documented rotation, serialization, atomic replacement, and terminal recovery contract.

## Keep the Developer Portal walkthrough synchronized

`docs/WALKTHROUGH.md` is the canonical source for the shared hands-on walkthrough published in the Lunch Money Developer Portal. Synchronize it manually so the generated walkthrough can be reviewed with the surrounding documentation instead of arriving in a separate automated pull request.

After committing a walkthrough change:

1. Copy the sample commit's complete SHA into `scripts/oauth-sample-walkthrough-source.json` in a sibling `lunch-money/developer-docs` checkout.
2. From that developer-docs checkout, run:

   ```sh
   npm run sync:oauth-sample -- \
     --sample-root ../lm-oauth-confidential-node-example

   npm run validate:oauth-sample -- \
     --sample-root ../lm-oauth-confidential-node-example
   ```

3. Review the changes to `scripts/oauth-sample-walkthrough-source.json` and `docs/oauth/sample-applications.md` with the rest of the OAuth documentation.
4. Stage and commit those two files in the developer-docs pull request. Do not edit the generated region by hand.

This repository includes a non-blocking pre-commit reminder for staged walkthrough changes. Enable the versioned hooks once per clone:

```sh
git config core.hooksPath .githooks
```

The pull request template repeats the reminder because Git does not install repository hooks automatically.

For contribution questions, email [dev-support@lunchmoney.app](mailto:dev-support@lunchmoney.app) or ask in the [developers channel on Discord](https://discord.com/channels/842337014556262411/1134594318414389258). [Join the Lunch Money Discord](https://lunchmoney.app/discord) if needed. Report security concerns privately by email rather than in Discord or a public issue.

Contributions are licensed under the repository's [MIT License](LICENSE).
