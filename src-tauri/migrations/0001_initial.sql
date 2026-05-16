CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  client_name TEXT,
  industry TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE source_files (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  local_path TEXT NOT NULL,
  status TEXT NOT NULL,
  extracted_text_path TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE source_chunks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  page_number INTEGER,
  sheet_name TEXT,
  row_start INTEGER,
  row_end INTEGER,
  column_start INTEGER,
  column_end INTEGER,
  heading_path TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
);

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  codex_thread_id TEXT,
  run_type TEXT NOT NULL,
  schema_name TEXT,
  schema_version TEXT,
  input_hash TEXT,
  model TEXT,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  request_summary_path TEXT,
  response_json_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  extracted_item_id TEXT,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  influence_level TEXT,
  information_richness TEXT,
  confidence_status TEXT,
  badges_json TEXT NOT NULL DEFAULT '[]',
  position_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE edges (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  flow_type TEXT,
  strength TEXT,
  direction TEXT,
  confidence_status TEXT,
  evidence TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
