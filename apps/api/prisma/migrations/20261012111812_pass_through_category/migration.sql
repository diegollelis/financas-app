-- The debit category of the shares split from a credit (ADR 0052), for the workspaces that
-- already exist. New workspaces get it from the API (src/categories/default-categories.ts).
-- A workspace that already has a debit category of that name, in any case, keeps its own.
INSERT INTO "categories" ("id", "workspace_id", "name", "type", "updated_at")
SELECT uuidv7(), w.id, 'Repasse', 'DEBIT'::"transaction_type", CURRENT_TIMESTAMP
FROM "workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c
  WHERE c.workspace_id = w.id AND c.type = 'DEBIT' AND lower(c.name) = 'repasse'
);
