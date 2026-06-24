/**
 * Semantic guard for HIGH/CRITICAL boolean fields.
 * Locks strict `true` / `"true"` semantics; any other value (including
 * `"false"`, `"0"`, `"no"`, `"yes"`, `1`, `0`) returns `false`.
 *
 * This prevents z.coerce.boolean()'s JS Boolean() widening from accepting
 * `"false"` → `true` on registry-mutation gates.
 *
 * Usage: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional()
 */
export const strictBooleanGuard = (v) => v === true || v === "true";
