import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Same base as apps/web, with a documented amnesty.
 *
 * This app spent its life in a repo that had no linter at all, so adopting the
 * shared config surfaced 24 pre-existing errors in one go. Failing the build on
 * them would mean rewriting a two-thousand-line client component as part of a
 * directory move, which is how a move turns into a rewrite and stops being
 * reviewable.
 *
 * So they are warnings here rather than off: they stay visible on every lint
 * run and can be paid down deliberately. Two of them are worth real attention
 * rather than a mechanical fix, since they may be genuine bugs:
 * `react-hooks/set-state-in-effect` fires in four places, and
 * `react-hooks/exhaustive-deps` flags a useEffect missing three dependencies.
 *
 * New code should not add to this list. When the count reaches zero, delete
 * this block and inherit apps/web's config unchanged.
 */
const inheritedDebt = {
  files: ["app/**/*.{ts,tsx}"],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/set-state-in-effect": "warn",
  },
};

/** Plain Node scripts, run directly by the Railway preDeployCommand. */
const nodeScripts = {
  files: ["scripts/**/*.{js,mjs}"],
  rules: {
    // CommonJS is correct here: migrate.js is executed by `node` outside the
    // bundle, not compiled as part of the app.
    "@typescript-eslint/no-require-imports": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  inheritedDebt,
  nodeScripts,
]);

export default eslintConfig;
