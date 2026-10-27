# Initial workspace only — live release

Owner clarification: automatic fitting applies only to the initial workspace;
Account and generated reports keep original size and natural page scrolling.
This is the sole authorized exception to the original-behavior lock.

Runtime: `01e2e40`, canonical release branch.
Archive: `.v2-tmp/deploy-01e2e40`.
Deployment: `dpl_E5GVzsTeZ8TsJ7UqycUx49X373oq`.
URL: https://kidbuster-gg4wo0ijv-thembones90-sudos-projects.vercel.app
Both classbuster.com and kidbuster.vercel.app verified on this deployment.
Rollback: `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1` (original pre-resizing behavior).

The only index.html changes from the original baseline are two asset references.
Existing application functions and handlers are unchanged. The separate
initial-workspace-fit CSS/JS applies proportional fitting only while Output is
empty and Account, dialogs and popovers are closed. It reserves capacity for all
rating explanations before selection, so choosing 6 cannot change the scale.
The scale is released before existing header/Generate handlers open their normal
views. There is no DOM reparenting, copied form, handler replacement, Output height
limit or internal Output scroll container. Closing Account or using New Student
returns to fitting when the workspace is empty again.

Verification:
- All 117 test files passed: `work/initial-only-fit-release-full.log`.
- New actual-browser regression covers all seven protocols at seven viewport
  sizes, including mobile emulation, stable rating 6, original Account and native
  popover behavior/DOM parents, original generated report scrolling and New Student.
- Existing tests retain functional checks; scaled geometry is checked at native
  layout size or visible rendered pixels, and clicks use the visible radio labels.
  Animation and receipt tests wait for their actual completion phases.
- Static and synthetic release integrity passed.
- Staged candidate passed 24/24 endpoint checks and five additional refusal probes.
- Both public domains passed 24/24 after promotion.
- Live browser HTML hash matched the exact archive. Initial 1909x943 workspace
  fit at scale 0.7722 with no page overflow; rating 6 retained that scale. Account
  used zoom 1, width 1240px and its original 20px heading. A simulated 3550-character
  report used zoom 1, natural page scrolling and zero internal Output overflow.
  New Student returned to the fitted initial workspace.
- No paid generation, customer data writes, real lesson content or Scout install.

The original controls and behavior remain locked outside the initial workspace.
No secondary view mode or Account view selector was added.
