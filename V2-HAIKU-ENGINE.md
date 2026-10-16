# V2 report engine: Haiku 5.5

Owner selected `claude-haiku-5-5` after reviewing the October 16 benchmark. All seven protocols use the same model. The existing direct Anthropic integration and V2-only Preview key remain; no Gateway migration, automatic Sonnet escalation, or automatic paid retry was added.

Requests use adaptive thinking at medium effort and a 10,000-token combined thinking/report budget. Protocol-specific character and word limits are unchanged. Larger provider headroom is not a larger allowed report. Thinking blocks are not returned as report text. Refusals and truncated responses fail without consuming report quota.

Successful responses include the returned provider model and a server-side standard-global list-price estimate. Output usage already includes thinking; do not double count it. Cache writes/reads are priced separately and the higher Haiku tier applies when total prompt tokens exceed 100,000. Rates are estimates, not invoices; refresh them when Anthropic changes pricing. Historical stored estimates are not rewritten.

The model choice is server-owned; browser-supplied model fields cannot change it. Roll back using a previously tested V2 deployment if necessary, updating both the app and webhook-ingress aliases together. Never promote to the original production project as part of a V2 release.

This model switch does not certify output quality or deploy the separate benchmark repair/validator implementation. Evidence grounding, output-length adherence, and teacher review remain separate follow-up work. Preserve all seven protocol themes and Krisp's persistent ARM behavior.

Provider migration reference: https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide
