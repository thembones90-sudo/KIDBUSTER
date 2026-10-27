# Generated report display — live

Runtime: `ab153bd`, canonical release branch.
Exact archive: `.v2-tmp/deploy-ab153bd`.
Deployment: `dpl_DLuwNrt2zVD6yoE97qHJ4jxzchJQ`.
URL: https://kidbuster-41o2jciil-thembones90-sudos-projects.vercel.app
Both classbuster.com and kidbuster.vercel.app verified on this deployment.
Rollback: `dpl_5VAp2wsDwcTTJPHX5eMfmrkhwE7n`.

The previous fitting script measured unrestricted generated report height and
scaled the entire application down to fit it. Long reports made everything tiny.
The original output panel now reserves its empty footprint. Long report fields
scroll within Output; supplementary feedback remains accessible within the panel.
Generation opens at the start of the report instead of scrolling the panel down
to the action buttons. Full report text, formatting, editing, copy behavior and
generation requests are unchanged. Asset references are versioned `20261025-2`.

Verification:
- Clean full run: all 117 test files passed (`work/report-fit-final-full.log`).
- Regression covers long content in all seven protocols across seven viewport
  sizes, with unchanged scale and no document overflow. It also runs the actual
  generation UI with simulated provider responses at 1909x943 and 1366x650.
- Appearance test now clicks visible protocol labels rather than hidden 1px inputs.
- Static and synthetic release integrity passed.
- Candidate: 24/24 endpoint checks plus five additional refusal probes passed.
- Live: both public domains passed 24/24. Actual generation UI with simulated
  3495-character report passed at both screen sizes. No paid generation, customer
  data writes or real lesson content was used.

Staging incident: the initial archive lacked its Vercel project link. CLI --yes
created unused project `deploy-ab153bd` (`prj_HsiHaaqtkSiJECDr6IhUW1RSO77d`),
deployment `dpl_uJDWPqbv1vDCg5XyrM6X89zr3DNY`. This did not affect either live
domain. The archive was explicitly linked to the existing kidbuster project and
redeployed before checking or promoting. The unused project has no production
environment configuration. Vercel's deletion connector requires user confirmation:
https://vercel.com/thembones90-sudos-projects/deploy-ab153bd/settings/general#delete-project
