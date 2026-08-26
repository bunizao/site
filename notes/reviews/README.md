# Reviews

Audit reports do not live here.

An audit report is, by genre, an inventory of where a system is weak, and this
repository is public. The July 2026 architecture audit also covered `site-api`,
so a public branch ended up describing unfixed findings in the private worker.
That is the mistake this file exists to prevent.

Write audit reports in `site-api/docs/reviews/` instead — the private half can
hold findings about either side, the public half cannot. The remediation work
splits normally: public workstreams get a plan under `plans/` here,
private ones there.

The July 2026 report is now `docs/reviews/architecture-audit-2026-07.md` in
`site-api`. Its `site` workstreams are PRs
[#65](https://github.com/bunizao/site/pull/65)–[#68](https://github.com/bunizao/site/pull/68).
