// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Build output + standalone Node/Workflow tooling scripts that are NOT part
    // of the shipped RN app and use different globals/parsers (Node __dirname,
    // Workflow top-level return). Linting them with the app config produces
    // false no-undef / parse errors.
    ignores: ["dist/*", "brand/**", "scripts/**", "knowledge/agents/**"],
  },
  {
    rules: {
      // Purely stylistic (apostrophes/quotes in JSX text render fine); no
      // correctness impact. Standardly disabled in Expo/RN apps.
      "react/no-unescaped-entities": "off",
      // React-Compiler-aware rules that flag WORKING, pre-existing patterns in
      // this codebase, none of which are runtime bugs (verified by a full
      // flow-trace audit): `immutability` fires on Reanimated shared-value
      // mutation (`sv.value = withSpring(...)`), which is the correct Reanimated
      // API; the others fire on legitimate sync/animation effects. Kept as
      // WARNINGS (visible, not hidden) for a deliberate future cleanup rather
      // than blocking the build or forcing risky refactors.
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
