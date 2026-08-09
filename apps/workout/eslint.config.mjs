import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Same base as apps/web, with two rules relaxed to warnings for this app.
 *
 * This app spent its life in a repo with no linter, so adopting the shared
 * config surfaced a batch of reports at once. They were triaged rather than
 * bulk-suppressed:
 *
 *  - `react-hooks/set-state-in-effect` — every hit here is an intentional,
 *    correct pattern the rule is conservative about: SSR-safe randomness
 *    (`embed-week-client`), localStorage hydration on mount (`theme`, the
 *    weekly-target effect), a `storage`-event subscription, and derived-state
 *    resets keyed on a changed value. None is a cascading-render bug. A warning
 *    keeps them visible without forcing risky rewrites of a working
 *    two-thousand-line component.
 *  - `@typescript-eslint/no-explicit-any` — the remaining `any`s are dynamic
 *    JSON-RPC params and JSON payloads where a precise type buys little.
 *
 * The genuinely wrong things this surfaced were fixed rather than downgraded:
 * a misplaced exhaustive-deps directive and the pre-existing title-block
 * effect. New code should not add to the two relaxed rules.
 */
const relaxed = {
  files: ["app/**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/set-state-in-effect": "warn",
    // Bindings deliberately prefixed with `_` are intentional throwaways
    // (destructured-but-unused, caught-but-unused); do not flag them.
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  relaxed,
]);

export default eslintConfig;
