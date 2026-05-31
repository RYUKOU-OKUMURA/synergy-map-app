ALTER TABLE versions ADD COLUMN name TEXT;
ALTER TABLE versions ADD COLUMN memo TEXT;

CREATE TABLE action_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  ai_run_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);

CREATE TABLE map_notes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'thought',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_action_items_project ON action_items(project_id);
CREATE INDEX idx_action_items_status ON action_items(project_id, status);
CREATE INDEX idx_map_notes_project ON map_notes(project_id);
