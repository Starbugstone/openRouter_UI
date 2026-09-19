# PR #8 screenshots

Captured from the running application in Chromium at a 1440 × 1000 desktop viewport. The account and model data come from `tests/e2e/fixtures.js`; balances, model names, and prices are illustrative fixtures, not live OpenRouter data. No real account or paid inference was used.

- `01-connect.png`: AI Playground branding and OpenRouter connection entry point (full page).
- `02-account.png`: connected account usage, remaining allowance, reset period, and management actions (account region).
- `03-paid-models.png`: model selection after accepting paid-model opt-in, including token and image pricing (modal).

These images document the PR's UI; they are not visual regression baselines. Interaction regressions are covered by the unit and Playwright suites.
