CREATE TABLE ai_lens_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  ai_run_id TEXT,
  category TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence_status TEXT NOT NULL DEFAULT 'estimated',
  evidence TEXT NOT NULL,
  follow_up_question TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_lens_items_project ON ai_lens_items(project_id);
CREATE INDEX idx_ai_lens_items_run ON ai_lens_items(ai_run_id);
