# Classbuster Brand Transition Kit

Prepared from the approved **green book + lightning Classbuster logo**. No production project was changed.

## Accurate artwork versus reconstructed vectors
- `classbuster-primary-lockup-transparent.png`: raster extraction of the approved illustration (transparent background).
- `classbuster-symbol-master-transparent.png`: approved icon extracted from the raster illustration.
- `classbuster-wordmark-master-transparent.png`: approved wordmark extracted from the raster illustration.
- `classbuster-horizontal-transparent.png`: compact layout of these exact extracted elements.
- `classbuster-symbol-clean-vector.svg`: hand-built **simplification** of the book/lightning for infinite scaling. **Not an exact vector copy**; requires visual approval before becoming official.
- `classbuster-wordmark-concept.svg`: editable text interpretation, **not a typography-identical official mark**.
- Dark/light lockups and icon size exports: generated from the approved extracted artwork.
- Monochrome marks: alpha silhouettes, use when single-color styling is required.
- `classbuster-maskable-*`: safe-padding PWA icon templates.

## Suggested usage
- Website header: `classbuster-horizontal-transparent.png` (on dark background)
- Splash/about screen: `classbuster-primary-lockup-transparent.png`
- Scout interface / 64px button: `classbuster-icon-dark-64.png`
- Windows app or desktop shortcut: `classbuster-icon-dark-256.png` or `favicon.ico`
- Website favicon: `favicon.ico`; also `classbuster-icon-dark-32.png`
- PWA app icons: `classbuster-icon-dark-192.png`, `classbuster-icon-dark-512.png`
- iOS app home screen: `apple-touch-icon.png`
- White background surfaces: `classbuster-icon-light-*.png`

## Migrating from Pathfinder safely
1. Back up the existing brand assets, deployments, database snapshots, environment variables, and domain mappings.
2. Copy this pack into a **new** versioned `assets/brand/classbuster/` folder. Do not overwrite old Pathfinder assets yet.
3. Replace brand visuals in a dedicated staging branch; use filenames by intended role rather than replacing unrelated protocol/customer logos.
4. Update HTML/PWA app metadata, favicons, webmanifest, auth email branding, account/settings visuals, customer documentation, Scout header and tray/taskbar icons.
5. Keep existing production URLs, customer accounts, subscriptions, webhooks, API keys, and existing paid customer data intact.
6. Verify legacy Pathfinder routes, Lemon Squeezy redirects/webhooks, Krisp integration, all reporting protocols, and Scout owner-only gating before production rollout.
7. Preserve Pathfinder and older Scout artwork until rollback is no longer needed. Stage first, no surprise deploy.
8. The name CLASSBUSTER and domain purchase remain subject to legal/trademark clearance.

## Brand tokens (sampled/approximated for implementation)
Dark ink #051111; electric green #14E745; bright green #70FF74; off-white #F4FAF4. Use `brand-tokens.css`.

## Quality limitations
The approved source is an AI-generated raster composition, not a layered illustration. Extraction necessarily preserves some baked-in background halos and may show dark fringes when placed against light backgrounds. The vector is simplified and has not been approved as the official master. Professional manual vector tracing and font outlining are recommended for final production-grade SVG.
