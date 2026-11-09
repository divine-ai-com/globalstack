# Financial calculation component

`calculation.mjs` provides bounded decimal addition, subtraction, percentage
change and percentage-of for two explicitly cited values. It uses integer fixed-point arithmetic
with six fractional places. Percentage change is
`(current - previous) / abs(previous) * 100`, rounded to six decimal places
with half ties away from zero. Percentage-of uses `numerator / abs(denominator) * 100`
with the same rounding. Addition, subtraction and percentage-of require the same
currency, unit and period. Percentage change requires matching currency and
unit, distinct periods and a nonzero previous value. The caller must identify
which period is current and which is previous.

The component does not verify that a cited document exists or that its page
contains the supplied value. The planned ingestion and retrieval flow must
bind each operand to a verified source before an agent can call it. Passing
these local tests does not validate whether the chosen formula makes business
sense or establish Azure deployment, agent behavior or a financial-scenario
result.

`corpus/` is a deterministic seed set of 12 logical synthetic filings across
two fictional issuers, three years and two reporting periods. One filing has a
second revision, so there are 13 physical text files. Its manifest records
SHA-256 hashes and 24 known-answer questions: 22 numerical answers, one
missing-evidence abstention and one mixed-unit rejection. One filing includes a
harmless prompt-injection fixture. The generated question values are checked
against pinned examples, and CI checks that committed files match the generator.
These plain-text fixtures do not yet exercise PDF parsing, live retrieval,
agent synthesis, Content Safety, Cosmos audit or Azure deployment.
