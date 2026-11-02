# Krisp and Pending transcripts disappearing during startup outages

Owner screenshot showed both header controls absent. Read-only deployment lookup still resolved classbuster.com to `dpl_FqL6PuiuLSYo21nm3jazEW6UYxP9`; the isolated Redis audit patch had not been deployed. This is an existing live startup behavior, not evidence that the audit patch removed the controls.

`initKrispPanel` previously treated every non-OK initialization response or thrown request as an account rejection and left both controls hidden. A Redis quota failure can produce a service error, so authorization failure and service availability must be handled separately.

Repair:

* Explicit401/403 still hide account-gated controls. Account changes/sign-out clear prior records.
* Network/timeout/other HTTP failures keep Krisp and Pending transcripts reachable for a saved account, with the existing unavailable status and an unknown count rather than a false empty inbox.
* The visibility fallback never sets the entitlement flag and never grants API access or Scout authorization. Server authorization is unchanged.
* Opening the unavailable inbox retries authenticated initialization; scheduled recovery uses the bounded poll budget. Scout count events preserve the unavailable navigation and warning.
* No layout, protocol, backend record, credential, billing or native Scout change.

The browser regression explicitly checks visible outage controls, opening the inbox, the explanatory error, absence of granted entitlement, resilience to Scout events, automatic recovery, revoked-account hiding and sign-out clearing. All prior assertions remain, with the earlier startup-outage expectation updated to the owner's newly requested visible-unavailable behavior.

This repairs navigation only; it does not reset an exhausted Redis allowance or prove production transcript retrieval healthy. No production API calls with real account credentials were made during the synthetic verification.

## Published after owner restored capacity

On2026-10-29 the owner explicitly approved merging and publishing the repair, then completed the existing database's Pay As You Go upgrade. Candidate checks had previously failed22/24 with `ERR max requests limit exceeded`; after the owner's upgrade all24 passed without changing the candidate.

* Canonical runtime commit:`5155acc` (includes preserved hotfix`7dfb0dc`, audit guard`41ad590`, navigation repair`0be0baf`, and the newer Scout installation documentation).
* Exact deployed source matched the tested patch. Local128/128 test files passed; GitHub run`40931169667` on`5155acc` completed successfully.
* Release integrity gate passed. An immutable Git archive was staged with explicit existing team scope and`--prod --skip-domain`; no credentials or database settings were changed by the agent.
* Candidate:`dpl_8zGNr5WFS1Y9XpR6jYhtsEqVJtKA`, `kidbuster-2565ehz7c-thembones90-sudos-projects.vercel.app`. Exact index, polling budget, Scout client and presentation asset bytes passed; all24 staged smoke checks passed after capacity restoration.
* The already-approved candidate was promoted. Read-only deployment lookup confirmed classbuster.com points to this READY deployment. Exact assets and24/24 live checks passed on **both classbuster.com and kidbuster.vercel.app**.
* Previous retention-aware live deployment/rollback:`dpl_FqL6PuiuLSYo21nm3jazEW6UYxP9`.
* The CLI initially required explicit`--scope thembones90-sudos-projects`; no authentication settings were changed. Protected-candidate checks used existing authenticated CLI access, not exposed bypass secrets.
* These are static, synthetic and refusal-only live checks. No new owner-generated report or real customer transcript was submitted as a release test. No desktop Scout process, profile, recording or installed version was modified.

The audit's earlier capacity NO-GO described the exhausted-cap state; that blocker cleared in the post-upgrade probes. Provider billing was changed by the owner, not by this repair. External usage alert provisioning and reconciliation remain follow-up operational work.
