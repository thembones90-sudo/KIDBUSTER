# Protocol changes on this branch are NOT yet approved for production — 2026-10-24

Commit `f346555` (speaker labels kept, shared LESSON ESSENCE RULES, Blitz framing,
history-claim repair) and the Blitz V1.2 work that follows it change what every
report says. They pass all automated tests, but the owner asked for real generation
tests (tools/model-benchmark.cjs, phase `audit`) before release, and those have
not run yet (waiting for a dedicated evaluation key and spend approval).

Any release candidate built from `f346555` or later (for example `2e6a6d2`, staged
as kidbuster-8hgubfvge) carries these protocol changes. Do not promote such a
candidate for an unrelated change without the owner's explicit OK for the protocol
changes too. For an urgent unrelated fix, build it on `ac96efd` (live protocols).

Live protocol text today: production `dpl_DFpZKiduTj3riTRH12UhuUi74x9h` (`1a03099`).
This note is removed once the owner approves the protocol release.
