# Financial calculation component

`calculation.mjs` provides bounded decimal addition, subtraction and percentage
change for two explicitly cited values. It uses integer fixed-point arithmetic
with six fractional places. Percentage change is
`(current - previous) / abs(previous) * 100`, rounded to six decimal places
with half ties away from zero. Addition and subtraction require the same
currency, unit and period. Percentage change requires matching currency and
unit, distinct periods and a nonzero previous value. The caller must identify
which period is current and which is previous.

The component does not verify that a cited document exists or that its page
contains the supplied value. The planned ingestion and retrieval flow must
bind each operand to a verified source before an agent can call it. Passing
these local tests does not validate whether the chosen formula makes business
sense or establish Azure deployment, agent behavior or a financial-scenario
result.
