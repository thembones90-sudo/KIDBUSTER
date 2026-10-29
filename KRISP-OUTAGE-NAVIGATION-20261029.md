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
