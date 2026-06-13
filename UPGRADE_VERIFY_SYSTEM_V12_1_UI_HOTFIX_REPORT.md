# Verify System v12.1.1 UI Hotfix Report

## Scope
This hotfix fixes the Admin Console / Verify pages rendering as unstyled default HTML when the external CSS asset is missing, stale, or served from an old Service Worker cache.

## Changes
- Added inline critical Verify UI CSS fallback to:
  - admin-verify.html
  - verify.html
  - verify-registry.html
- Added cache-busting query string to Verify CSS and JS assets.
- Bumped Service Worker cache version to 12.1.1-ui-hotfix.
- Updated Service Worker app shell paths for Verify assets with cache-busting query strings.
- Updated package.json version and VERSION.txt.

## Why
The v12 HTML could be loaded from network while CSS/JS could still be served by an old cache-first Service Worker route or fail to load on hosting. Inline fallback CSS makes the pages remain styled even if the external CSS is unavailable.

## Validation
- npm run check:js passed.
- HTML contains inline critical CSS fallback.
- Verify/Admin asset URLs now include v=12.1.1-ui-hotfix.
