// MagicQ sets no hard limit on execute pages and numbers, but this module uses
// them as array indices, so an unbounded value - a typo, or an expression
// resolving to 1e9 - would allocate an array that long and freeze the module
// for tens of seconds the next time the variables are rebuilt. Far above any
// real desk, and shared so the limits and the messages about them stay in step.
export const MAX_EXEC_PAGE = 1000
export const MAX_EXEC_NR = 1000
