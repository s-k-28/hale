# Building + running HALE locally

## Why this file exists

There was no working local build path. Both known checkouts were broken:

- **`~/Desktop/Project Folder/Hale`** (this repo) — the path contains a **space**, which
  breaks the RN 0.85 native build. Editing, typechecking, linting and `jest` all work
  fine here. `npx expo run:ios` does not.
- **`~/halecap`** — stale. Not a git repo at all, still on **v1.0.0** with the old
  `com.haleapp.hale` bundle id. The HALE build sitting on the simulator from it is a
  dead debug binary that just shows "No script URL provided". Do not trust it.

## The working recipe (verified: Build Succeeded, 0 errors)

Build from a **space-free path**. Keep this repo as the source of truth and mirror
source into the build clone.

```bash
# 1. one-time: create the build clone
rm -rf ~/hale-build && mkdir -p ~/hale-build
rsync -a --exclude '.git' --exclude ios --exclude android --exclude .expo \
      --exclude marketing --exclude apple \
      "$HOME/Desktop/Project Folder/Hale/" ~/hale-build/

cd ~/hale-build
rm -rf node_modules && npm ci        # do NOT rsync node_modules; it copies over incomplete

# 2. one-time: install the dev-client (see note below)
npx expo install expo-dev-client

# 3. build + install + start Metro
npx expo run:ios
```

Then, to iterate on JS without rebuilding native (Metro fast-refreshes):

```bash
rsync -a --delete "$HOME/Desktop/Project Folder/Hale/src/"    ~/hale-build/src/
rsync -a --delete "$HOME/Desktop/Project Folder/Hale/convex/" ~/hale-build/convex/
```

## Gotchas that cost real time

- **`expo-dev-client` was never a dependency.** `expo run:ios` still opens the app with
  an `…://expo-development-client/?url=…` deep link, which a build without the package
  cannot handle. Install it in the build clone. It is intentionally **not** added to
  this repo's `package.json` yet: 1.0.2 is about to go to App Review and adding a native
  dependency days before submission is not a risk worth taking. Add it after 1.0.2 ships.
- **Never `rsync` `node_modules`.** It arrives incomplete (`@expo/cli` loses
  `build/src/run/ios/index.js`) and `expo run:ios` dies with `MODULE_NOT_FOUND`.
  Always `npm ci` in the clone.
- **`.env.local` is required** for Convex + RevenueCat. It is gitignored, so a fresh
  `git clone` will not have it. The `EXPO_PUBLIC_*` values are also in `eas.json` (they
  are public client keys, not secrets).
- The simulator can wedge (`simctl` commands hang). Quit Simulator.app and
  `xcrun simctl shutdown all` before retrying.

## Verification that works from THIS repo (no native build needed)

```bash
npx tsc --noEmit     # 0 errors (one pre-existing scripts/ node-types error is excluded)
npx jest             # 130 passing
npx eslint src convex
```
