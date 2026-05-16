ALTER TABLE suggestions ADD COLUMN expected_revenue_impact TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE suggestions ADD COLUMN expected_profit_impact TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE suggestions ADD COLUMN cost_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE suggestions ADD COLUMN effort_level TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE suggestions ADD COLUMN time_to_impact TEXT NOT NULL DEFAULT 'mid';
ALTER TABLE suggestions ADD COLUMN confidence_status TEXT NOT NULL DEFAULT 'estimated';
ALTER TABLE suggestions ADD COLUMN impact_score INTEGER NOT NULL DEFAULT 50;
ALTER TABLE suggestions ADD COLUMN evidence TEXT;

CREATE TABLE view_layouts (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  view_id TEXT NOT NULL,
  layout_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, view_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_view_layouts_project ON view_layouts(project_id);
