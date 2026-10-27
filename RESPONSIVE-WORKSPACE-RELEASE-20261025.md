# Responsive workspace — live 2026-10-25

## Classic-size reference — current live release

Owner clarified that Classic's dimensions must apply across every protocol.
Runtime commit `98a6df7` is live at deployment `dpl_9gzpCc5LxSmxMFSrv4ffPWqmroph`.
Rollback: `dpl_CnNe6bcRUN2MmHaBgcZ1Wrp1sFfD`.
Exact archive: `.v2-tmp/deploy-98a6df7`.

The shared desktop row now reserves Classic's measured height: 704px normally,
536px with the existing short-screen layout. Column widths remain equal and
responsive. Protocols with fewer fields no longer shrink their panels. Mobile
retains natural scrolling.

All 117 test files passed. Geometry tests explicitly compare every protocol's
panel widths and heights against Classic at five viewport sizes. Release
integrity, 24 candidate checks and five additional refusal checks passed.
After promotion, both public domains passed 24/24 checks. Live Chrome checks
compared all seven modes directly against Classic at 1909x990 and 1366x650:
all panels matched, and essential controls remained within the viewport.
Actual live screenshots are in the chat outputs as CLASSBUSTER-LIVE-CLASSIC-SIZE.

## Equal-panel follow-up — current live release

Owner requested three equally sized panels for every protocol. Runtime commit
`8bd62ccf9999a67c0b95d2873a56274ba17a2f61` is now live, deployment
`dpl_CnNe6bcRUN2MmHaBgcZ1Wrp1sFfD` at
https://kidbuster-4m00fs5oc-thembones90-sudos-projects.vercel.app.
Rollback: `dpl_AtjPcA3ezEt4ahe23m66mNKW2818`.

Outer column sizing now accounts for both 14px gaps, producing three equal widths.
The settings panel stretches to the common row height, aligning all top and bottom
edges. The existing responsive breakpoints and normal mobile scrolling remain.

All 117 test files passed; new geometry checks cover equal width, height, top and
bottom for all seven protocols at five desktop sizes. Release integrity passed.
Staged candidate passed 24/24 checks and five additional access refusal probes.
After promotion both public domains passed 24/24. Actual live Chrome checks
confirmed equal panels for every protocol at 1909x990 and 1366x650, with essential
controls contained. Beida screenshots are saved in the chat outputs. Live CSS
matched the archive SHA-256:
`a55dd5ce39fed090f7efe3ec182d4759a9fd73b969266badf0868941594faaf5`.

## Initial responsive release

Published to classbuster.com after owner authorization. The earlier responsive patch had only been saved locally; this release makes it available on the live website.

- Commit: `963a4d9407d64e51d9228deca35773fb89b1fad3`.
- Branch: `release/classbuster-legacy-safe-20261023`, pushed to canonical KIDBUSTER.
- Baseline: `0650f80`, including all prior Scout card, branding and owner installer changes. Its HTML matched the pre-release public HTML exactly.
- Exact source export: `.v2-tmp/deploy-963a4d9`, created with `git archive`.
- Deployment: `dpl_AtjPcA3ezEt4ahe23m66mNKW2818`, READY production.
- URL: https://kidbuster-63aek2t98-thembones90-sudos-projects.vercel.app
- Rollback: `dpl_5kj416JwMSGRk57dNYGW9uRiRYr1`.

The desktop workspace uses settings, notes and output columns, with sizing based on browser width and height. The fixed sidebar minimum is removed. Short screens use tighter spacing; smaller screens retain natural vertical scrolling. All seven protocols and generation logic are retained.

Verification: all 117 test files passed on the canonical checkout. Initial test setup lacked local ESM dependency resolution; a dependency junction fixed that setup and a clean full rerun passed. Static/synthetic release integrity passed. The protected candidate passed 24/24 checks through authenticated Vercel curl, plus five refusal checks for pairing, name synchronization, monitoring, identity audit and cron. Protection was not disabled.

After promotion, classbuster.com and kidbuster.vercel.app each passed 24/24 release checks. Live HTML and responsive CSS matched the committed export byte-for-byte. Actual live Chrome renders at 1909x990 and 1366x650 had document dimensions equal to the viewport, with teacher, student, rating, Generate and output actions contained. Browser QA used no account credentials or real lesson data, and API requests were blocked during visual checks; all four header controls were forced visible with synthetic styling.

At 1909x990 the rating controls end at y=809 and output actions at y=751. At 1366x650 they end at y=594 and y=453 respectively. Screenshots and a copy of this release record are saved in the Codex chat outputs folder.

HTML SHA-256: `b3de2beec17e0b55661c125b0eef005341821b7f399898361bd2d2e998d2bab9`.
CSS SHA-256: `1e44b0fa27d56d95e67c9f00ccfa78884b6b54df5a8c64032056c9aa86561fd5`.

The original recovered checkout and other isolated Scout/Krisp changes were not modified or bundled. Documentation committed after the runtime release does not change the deployed source commit.
