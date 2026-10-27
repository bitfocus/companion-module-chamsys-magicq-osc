// MagicQ's built-in OSC addresses reach the first 10 execute grids only, so a
// page above 10 is silently ignored by the desk; this is its documented limit,
// confirmed against a console where every grid in use was 1-10. The item number
// has no such documented limit - 209 was observed - so it keeps a defensive
// ceiling instead.
//
// Both are also array indices here, so an unbounded value - a typo, or an
// expression resolving to 1e9 - would allocate an array that long and freeze
// the module for tens of seconds the next time the variables are rebuilt.
// Shared so the limits and the messages about them stay in step.
export const MAX_EXEC_PAGE = 10
export const MAX_EXEC_NR = 1000
