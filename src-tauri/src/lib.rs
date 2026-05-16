use std::fs;
use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{Manager, State};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use uuid::Uuid;

struct DbState {
    db_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    client_name: Option<String>,
    industry: Option<String>,
    description: Option<String>,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StorageInfo {
    db_path: String,
    app_data_dir: String,
}

struct Migration {
    version: i64,
    name: &'static str,
    checksum: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    name: "initial",
    checksum: "0001_initial_v1",
    sql: include_str!("../migrations/0001_initial.sql"),
}];

fn now_rfc3339() -> Result<String, String> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())
}

fn open_connection(db_path: &PathBuf) -> Result<Connection, String> {
    let connection = Connection::open(db_path).map_err(|error| error.to_string())?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn run_migrations(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL
            );",
        )
        .map_err(|error| error.to_string())?;

    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;

    for migration in MIGRATIONS {
        let applied_migration = transaction
            .query_row(
                "SELECT name, checksum FROM _migrations WHERE version = ?1",
                [migration.version],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        if let Some((name, checksum)) = applied_migration {
            if name != migration.name || checksum != migration.checksum {
                return Err(format!(
                    "Migration drift detected for version {}.",
                    migration.version
                ));
            }

            continue;
        }

        transaction
            .execute_batch(migration.sql)
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO _migrations (version, name, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    migration.version,
                    migration.name,
                    migration.checksum,
                    now_rfc3339()?
                ],
            )
            .map_err(|error| error.to_string())?;
    }

    transaction.commit().map_err(|error| error.to_string())
}

fn init_database(db_path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let mut connection = open_connection(db_path)?;
    run_migrations(&mut connection)
}

fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        client_name: row.get("client_name")?,
        industry: row.get("industry")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

fn get_project_by_id(connection: &Connection, id: &str) -> Result<Project, String> {
    connection
        .query_row(
            "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
             FROM projects
             WHERE id = ?1",
            [id],
            row_to_project,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_project(state: State<'_, DbState>, name: String) -> Result<Project, String> {
    let trimmed_name = name.trim();

    if trimmed_name.is_empty() {
        return Err("Project name is required.".to_string());
    }

    let connection = open_connection(&state.db_path)?;
    let id = Uuid::new_v4().to_string();
    let now = now_rfc3339()?;

    connection
        .execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, trimmed_name, now, now],
        )
        .map_err(|error| error.to_string())?;

    get_project_by_id(&connection, &id)
}

#[tauri::command]
fn list_projects(state: State<'_, DbState>) -> Result<Vec<Project>, String> {
    let connection = open_connection(&state.db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
             FROM projects
             WHERE archived_at IS NULL
             ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], row_to_project)
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_storage_info(state: State<'_, DbState>) -> Result<StorageInfo, String> {
    let app_data_dir = state
        .db_path
        .parent()
        .ok_or_else(|| "DB path has no parent directory.".to_string())?;

    Ok(StorageInfo {
        db_path: state.db_path.display().to_string(),
        app_data_dir: app_data_dir.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_safe_to_run_more_than_once() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("initial migration should run");
        init_database(&db_path).expect("second migration run should be safe");

        let connection = open_connection(&db_path).expect("connection should open");
        let migration_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .expect("migration count should be readable");

        assert_eq!(migration_count, 1);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn projects_persist_after_reopening_database() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));

        init_database(&db_path).expect("database should initialize");

        {
            let connection = open_connection(&db_path).expect("connection should open");
            let id = Uuid::new_v4().to_string();
            let now = now_rfc3339().expect("timestamp should format");

            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, "Persisted project", now, now],
                )
                .expect("project should insert");
        }

        let connection = open_connection(&db_path).expect("connection should reopen");
        let project_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("project count should be readable");

        assert_eq!(project_count, 1);

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn project_creation_trims_name_and_rejects_empty_names() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let create_with_name = |name: &str| -> Result<Project, String> {
            let trimmed_name = name.trim();

            if trimmed_name.is_empty() {
                return Err("Project name is required.".to_string());
            }

            let connection = open_connection(&db_path)?;
            let id = Uuid::new_v4().to_string();
            let now = now_rfc3339()?;

            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                    params![id, trimmed_name, now, now],
                )
                .map_err(|error| error.to_string())?;

            get_project_by_id(&connection, &id)
        };

        let project = create_with_name("  Trimmed project  ").expect("project should create");
        let empty_result = create_with_name("   ");

        assert_eq!(project.name, "Trimmed project");
        assert!(empty_result.is_err());

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn list_query_excludes_archived_projects() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let connection = open_connection(&db_path).expect("connection should open");
        let now = now_rfc3339().expect("timestamp should format");

        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at, archived_at)
                 VALUES (?1, ?2, ?3, ?4, NULL), (?5, ?6, ?7, ?8, ?9)",
                params![
                    Uuid::new_v4().to_string(),
                    "Active project",
                    now,
                    now,
                    Uuid::new_v4().to_string(),
                    "Archived project",
                    now,
                    now,
                    now
                ],
            )
            .expect("projects should insert");

        let mut statement = connection
            .prepare(
                "SELECT id, name, client_name, industry, description, created_at, updated_at, archived_at
                 FROM projects
                 WHERE archived_at IS NULL
                 ORDER BY updated_at DESC",
            )
            .expect("statement should prepare");
        let projects = statement
            .query_map([], row_to_project)
            .expect("query should run")
            .collect::<Result<Vec<_>, _>>()
            .expect("rows should map");

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "Active project");

        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn migration_drift_is_rejected() {
        let db_path = std::env::temp_dir().join(format!("synergy-map-test-{}.db", Uuid::new_v4()));
        init_database(&db_path).expect("database should initialize");

        let connection = open_connection(&db_path).expect("connection should open");
        connection
            .execute(
                "UPDATE _migrations SET checksum = 'changed' WHERE version = 1",
                [],
            )
            .expect("migration checksum should update");
        drop(connection);

        let result = init_database(&db_path);

        assert!(result.is_err());

        let _ = fs::remove_file(db_path);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let db_path = app_data_dir.join("synergy-map.db");

            init_database(&db_path).map_err(Box::<dyn std::error::Error>::from)?;
            app.manage(DbState { db_path });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_project,
            list_projects,
            get_storage_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
