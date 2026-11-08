# Graphite Studio background — 2026-11-08

## Owner correction: first trial too subtle

Owner rejected the initial visual impact. Corrected runtime `b92100b` is live,
promoted from `https://kidbuster-6rj18yns5-thembones90-sudos-projects.vercel.app`.
It increases material grain opacity to .085, uses graphite #171a1e, broad neutral
illumination at .13, a dark outer vignette and header accent at .09. The existing
appearance assertion for the dark base was updated to this intended color;
all other behavior assertions remain. Cache key is graphite-studio2.

Appearance suite and all141 local test files passed. Geometry comparisons passed
at3840x2024,2560x1440,1440x900,390x844. Before/after images at3840px reviewed;
the graphite material and edge contrast are visibly stronger. Authenticated candidate,
classbuster.com and compatibility host each passed26/26 probes and exact
index/CSS/Scout manifest/release stamp checks. Native Scout unchanged.
GitHub run42461898835 was pending at the last check; do not claim it passed
without independently checking. Revert only the background commits on the latest
lineage if requested; do not roll back unrelated live work.

## Earlier trial record

The owner approved trying the proposed graphite background, with reversal if disliked.

Runtime: `0c2d94b9754ac2f2c7a4edac205b1b5531ae7643`.
Branch: `codex/graphite-studio-20261108`.
Candidate promoted: `https://kidbuster-hdfpd1ysv-thembones90-sudos-projects.vercel.app`.
Prior live runtime: `23f21ef`; prior deployment: `dpl_Fwwx3GyYBP9miSn6bo4pi8PxwFpj`.

Only assets/themes/appearance-v1.css and its cache version in index.html changed.
Dark appearance gets a repeating 160px static SVG grain, a restrained header accent,
and neutral central illumination on #101113. Protocol accent changes still interpolate;
there is no perpetual animation. No elements, overlays, positioning, sizing, JS,
business logic, native binaries, account data or delivery behavior changed.
The light appearance retains its existing background.

Validation:
- 141/141 local test files passed; release integrity passed.
- Existing appearance suite passed: themes, protocols, mobile, persistence, keyboard,
  real dissolve, reduced motion and fallback.
- Read-only synthetic browser comparison at 2560x1440, 1440x900 and 390x844:
  identical workspace rectangles/document dimensions with the new background enabled
  or disabled, no horizontal overflow. Desktop/mobile screenshots inspected.
- GitHub CI run 42452467159 succeeded on the runtime commit.
- Guarded stage/promote checked live lineage and newest Scout release lock (1.4.19).
- Authenticated candidate and both production hosts passed 26/26 refusal/read-only probes.
- Candidate, classbuster.com and retained compatibility domain served byte-identical
  index, background stylesheet, Scout release manifest and correct release stamp.

Primary CLI staging returned Not authorized. Retried through the existing authenticated
native PC CLI with the same guarded tool; no auth scopes or protection settings changed.
No real customer account/report/payment was used for this paint-only change.

Revert: revert only runtime commit 0c2d94b on the latest release lineage, validate,
then guarded stage/promote. This preserves later work and the current Scout download.
