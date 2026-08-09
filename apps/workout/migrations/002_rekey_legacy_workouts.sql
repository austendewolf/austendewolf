-- Re-key the original undated workout rows to dated ids matching the
-- current week's schedule. Idempotent: only renames rows whose id has
-- no date prefix and only when the dated id is not already present.

UPDATE workouts
SET id = '2026-05-30-upper2'
WHERE id = 'upper2'
  AND NOT EXISTS (SELECT 1 FROM workouts w2 WHERE w2.id = '2026-05-30-upper2');
