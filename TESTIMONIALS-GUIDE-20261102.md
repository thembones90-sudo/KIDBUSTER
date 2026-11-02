# Testimonials: developer guide (2026-11-02)

Public page: `/why-classbuster.html` (aliases `/why-classbuster` and `/testimonials`).
It is linked from the app's Account panel (opens in a new tab so lesson notes are kept)
and from the legal-page footers. The page has no inline script and makes no third-party
requests. Content Security Policy (CSP), prices, entitlements and billing are unchanged.

## The rule

**Nothing appears on the page unless a real teacher gave written permission to publish
that exact wording on the website.** Do not invent testimonials, stats, ratings, logos,
photos, videos, school names or endorsements. Do not paraphrase an approved quote; to
fix even a typo, get the teacher's approval again. With no approved entries the page shows
the product benefits and the beta-feedback invitation, with no placeholder cards.

## Files

| File | Public? | Purpose |
|---|---|---|
| `assets/testimonials/testimonials.json` | **Yes, served publicly** | Display data plus an opaque consent reference only |
| `assets/testimonials/testimonials.schema.json` | Yes | Schema of the file above |
| `assets/why-classbuster.js` | Yes | Runtime publication gate and safe text-only renderer |
| `tests/test-testimonials.cjs` | No | Gate, escaping, empty/missing data, routes and browser checks |
| Consent records | **Never in git or a deployment** | Owner's private storage |

## Private story proposals (in-app invitation)

After a teacher's feedback is saved, the app may invite them to share a story
(see TESTIMONIAL-INVITE-AFTER-FEEDBACK-20261102.md). Those stories are PRIVATE
proposals in the owner feedback view, never publishable as received. Treat one as
a starting point for step 1 below: the teacher must still approve the exact
wording, name form and website use before anything is added here.

## Adding an approved testimonial

1. Get written consent outside this repository, from the owner, not an agent. Agents must
   not contact teachers. The consent should cover the exact quote, the name form
   (for example first name only, or anonymous), the role/context line, the channels
   (must include `website`), any expiry, and the teacher's right to withdraw.
2. Store the signed consent privately, in the owner's own storage. Never commit it:
   `.gitignore` blocks `testimonial-consent/`, `*.consent.json` and `*.consent.pdf`,
   and deployments come from `git archive`. Give it an opaque id such as
   `CB-CONSENT-20261105-K3P9`. The id must not contain any name, email or school.
3. Add the entry to `testimonials.json`:

```json
{
  "id": "beta-teacher-001",
  "quote": "Exact approved wording, without student names.",
  "attribution": { "name": "Ana", "role": "Online ESL teacher", "context": "Beta tester" },
  "consent": {
    "status": "approved",
    "reference": "CB-CONSENT-20261105-K3P9",
    "approvedOn": "2026-11-05",
    "expiresOn": null,
    "channels": ["website"],
    "anonymous": false
  }
}
```

   - Omit `name`, or set `"anonymous": true`, to show "Classbuster beta teacher".
   - Fields beyond the schema (email, signature, notes, photo, studentName...) fail the
     gate on purpose, so private consent details cannot leak into the public file.
   - Quotes that contain an email address, link or phone number are rejected.
     Student names must be removed before asking for approval.
4. Run `node tests/test-testimonials.cjs` and `npm test`. The suite fails if any shipped
   entry does not pass the gate.
5. Release through the normal owner-approved web release process (AGENTS.md).

## Withdrawal or expiry

Remove the entry from `testimonials.json` and release. The runtime also hides entries
whose `status` is not `approved` or whose `expiresOn` has passed, but removal is the
real fix because the JSON file itself is public. Record the withdrawal in the private
consent record, not here.

## What the gate enforces (assets/why-classbuster.js)

`schemaVersion` 1; `status === "approved"`; an opaque `CB-CONSENT-YYYYMMDD-XXXX`
reference; a real, non-future `approvedOn`; an unexpired `expiresOn`; `channels`
includes `website`; whitelisted fields only; length limits; no control or bidi
characters; and no email addresses, links or phone numbers. At most 12 cards appear,
and duplicate ids appear once. Rendering uses `textContent` only, so markup in the data
shows as plain text.
