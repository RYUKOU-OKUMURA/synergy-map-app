ALTER TABLE projects ADD COLUMN memo TEXT;

ALTER TABLE source_files ADD COLUMN file_hash TEXT;

ALTER TABLE nodes ADD COLUMN adoption_status TEXT NOT NULL DEFAULT 'accepted';
ALTER TABLE nodes ADD COLUMN memo TEXT;

ALTER TABLE edges ADD COLUMN label TEXT;
ALTER TABLE edges ADD COLUMN adoption_status TEXT NOT NULL DEFAULT 'accepted';
ALTER TABLE edges ADD COLUMN priority TEXT;

CREATE TABLE extracted_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  ai_run_id TEXT,
  name TEXT NOT NULL,
  item_type TEXT NOT NULL,
  description TEXT,
  confidence_status TEXT NOT NULL,
  impact_score INTEGER NOT NULL DEFAULT 2,
  subjective_importance INTEGER NOT NULL DEFAULT 2,
  adoption_status TEXT NOT NULL DEFAULT 'accepted',
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);

CREATE TABLE item_sources (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  extracted_item_id TEXT NOT NULL,
  source_file_id TEXT,
  source_chunk_id TEXT,
  quote TEXT,
  page_number INTEGER,
  sheet_name TEXT,
  row_start INTEGER,
  row_end INTEGER,
  heading_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (extracted_item_id) REFERENCES extracted_items(id) ON DELETE CASCADE,
  FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE SET NULL,
  FOREIGN KEY (source_chunk_id) REFERENCES source_chunks(id) ON DELETE SET NULL
);

CREATE TABLE suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  ai_run_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL,
  adoption_status TEXT NOT NULL DEFAULT 'pending',
  rationale TEXT,
  related_node_ids_json TEXT NOT NULL DEFAULT '[]',
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);

CREATE TABLE ai_comments (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  ai_run_id TEXT,
  comment_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence_status TEXT NOT NULL DEFAULT 'estimated',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (ai_run_id) REFERENCES ai_runs(id) ON DELETE SET NULL
);

CREATE TABLE versions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  version_type TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE codex_threads (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL,
  output_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_source_files_project ON source_files(project_id);
CREATE INDEX idx_source_chunks_project ON source_chunks(project_id);
CREATE INDEX idx_extracted_items_project ON extracted_items(project_id);
CREATE INDEX idx_item_sources_item ON item_sources(extracted_item_id);
CREATE INDEX idx_nodes_project ON nodes(project_id);
CREATE INDEX idx_edges_project ON edges(project_id);
CREATE INDEX idx_suggestions_project ON suggestions(project_id);
CREATE INDEX idx_ai_comments_project ON ai_comments(project_id);
CREATE INDEX idx_ai_runs_project ON ai_runs(project_id);
CREATE INDEX idx_export_jobs_project ON export_jobs(project_id);
