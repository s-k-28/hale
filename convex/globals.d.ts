// The Convex runtime provides `process.env` for environment variables set via
// `npx convex env set` (auth.config.ts, email.ts, http.ts, pushes.ts, sage.ts all
// read it at runtime). Convex's tsconfig deliberately excludes @types/node (its V8
// runtime is not Node), which left `process` unresolved and failed the typecheck —
// blocking deploys of any new mutation. Declare ONLY the env shape Convex actually
// provides, so we don't falsely expose Node APIs that don't exist in this runtime.
declare const process: { env: Record<string, string | undefined> };
