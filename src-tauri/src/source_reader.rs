use std::fs;
use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use encoding_rs::SHIFT_JIS;
use serde::Serialize;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceChunkDraft {
    pub chunk_index: usize,
    pub content: String,
    pub content_hash: String,
    pub page_number: Option<i64>,
    pub sheet_name: Option<String>,
    pub row_start: Option<i64>,
    pub row_end: Option<i64>,
    pub column_start: Option<i64>,
    pub column_end: Option<i64>,
    pub heading_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadSourceDraft {
    pub file_name: String,
    pub file_type: String,
    pub status: String,
    pub error: Option<String>,
    pub chunks: Vec<SourceChunkDraft>,
}

pub fn read_source_file(path: &Path) -> ReadSourceDraft {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("source")
        .to_string();
    let file_type = detect_file_type(path);

    let result = match file_type.as_str() {
        "pdf" => read_pdf(path),
        "csv" => read_csv(path),
        "xlsx" | "xls" | "ods" => read_spreadsheet(path),
        "markdown" | "text" => read_markdown_or_text(path),
        _ => Err(format!("Unsupported source file type: {file_type}")),
    };

    match result {
        Ok(chunks) if chunks.is_empty() => ReadSourceDraft {
            file_name,
            file_type,
            status: "unreadable".to_string(),
            error: Some("No extractable text was found.".to_string()),
            chunks,
        },
        Ok(chunks) => ReadSourceDraft {
            file_name,
            file_type,
            status: "read".to_string(),
            error: None,
            chunks,
        },
        Err(error) => ReadSourceDraft {
            file_name,
            file_type,
            status: "error".to_string(),
            error: Some(error),
            chunks: Vec::new(),
        },
    }
}

fn detect_file_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "pdf".to_string(),
        "csv" => "csv".to_string(),
        "xlsx" => "xlsx".to_string(),
        "xls" => "xls".to_string(),
        "ods" => "ods".to_string(),
        "md" | "markdown" => "markdown".to_string(),
        "txt" | "text" => "text".to_string(),
        extension => extension.to_string(),
    }
}

fn read_pdf(path: &Path) -> Result<Vec<SourceChunkDraft>, String> {
    let pages = pdf_extract::extract_text_by_pages(path)
        .map_err(|error| format!("PDF text extraction failed or OCR is unsupported: {error}"))?;
    let mut chunks = Vec::new();

    for (page_index, text) in pages.into_iter().enumerate() {
        let content = normalize_text(&text);

        if is_extractable_text(&content) {
            chunks.push(SourceChunkDraft::new(chunks.len(), content).with_pdf_page(page_index + 1));
        }
    }

    Ok(chunks)
}

fn read_csv(path: &Path) -> Result<Vec<SourceChunkDraft>, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let content = match String::from_utf8(bytes) {
        Ok(value) => value,
        Err(error) => {
            let bytes = error.into_bytes();
            let (decoded, _, _) = SHIFT_JIS.decode(&bytes);
            decoded.into_owned()
        }
    };

    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(content.as_bytes());
    let headers = reader
        .headers()
        .map_err(|error| error.to_string())?
        .iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut chunks = Vec::new();

    for (index, record) in reader.records().enumerate() {
        let record = record.map_err(|error| error.to_string())?;
        let values = headers
            .iter()
            .zip(record.iter())
            .map(|(header, value)| format!("{header}: {value}"))
            .collect::<Vec<_>>()
            .join("\n");

        chunks.push(
            SourceChunkDraft::new(index, values)
                .with_csv_rows((index + 2) as i64, (index + 2) as i64),
        );
    }

    Ok(chunks)
}

fn read_spreadsheet(path: &Path) -> Result<Vec<SourceChunkDraft>, String> {
    let mut workbook = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let mut chunks = Vec::new();

    for sheet_name in workbook.sheet_names().to_owned() {
        let range = workbook
            .worksheet_range(&sheet_name)
            .map_err(|error| error.to_string())?;

        for (row_index, row) in range.rows().enumerate() {
            let cells = row.iter().map(cell_to_string).collect::<Vec<_>>();
            let content = cells.join("\t");

            if content.trim().is_empty() {
                continue;
            }

            chunks.push(
                SourceChunkDraft::new(chunks.len(), content).with_spreadsheet_location(
                    sheet_name.clone(),
                    (row_index + 1) as i64,
                    row.len() as i64,
                ),
            );
        }
    }

    Ok(chunks)
}

fn read_markdown_or_text(path: &Path) -> Result<Vec<SourceChunkDraft>, String> {
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut chunks = Vec::new();
    let mut current_heading = Vec::<String>::new();
    let mut current_content = Vec::<String>::new();

    for line in content.lines() {
        if let Some((level, heading)) = parse_markdown_heading(line) {
            push_markdown_chunk(&mut chunks, &current_heading, &mut current_content);
            current_heading.truncate(level.saturating_sub(1));
            current_heading.push(heading.to_string());
        }

        current_content.push(line.to_string());
    }

    push_markdown_chunk(&mut chunks, &current_heading, &mut current_content);

    if chunks.is_empty() && !content.trim().is_empty() {
        chunks.push(SourceChunkDraft::new(0, normalize_text(&content)));
    }

    Ok(chunks)
}

fn push_markdown_chunk(
    chunks: &mut Vec<SourceChunkDraft>,
    heading_path: &[String],
    current_content: &mut Vec<String>,
) {
    let content = normalize_text(&current_content.join("\n"));
    current_content.clear();

    if content.trim().is_empty() {
        return;
    }

    let mut chunk = SourceChunkDraft::new(chunks.len(), content);

    if !heading_path.is_empty() {
        chunk.heading_path = Some(heading_path.join(" > "));
    }

    chunks.push(chunk);
}

fn parse_markdown_heading(line: &str) -> Option<(usize, &str)> {
    let trimmed = line.trim_start();
    let level = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();

    if level == 0 || level > 6 {
        return None;
    }

    let heading = trimmed[level..].trim();

    if heading.is_empty() {
        None
    } else {
        Some((level, heading))
    }
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(value) => value.clone(),
        Data::Float(value) => value.to_string(),
        Data::Int(value) => value.to_string(),
        Data::Bool(value) => value.to_string(),
        Data::DateTime(value) => value.to_string(),
        Data::DateTimeIso(value) => value.clone(),
        Data::DurationIso(value) => value.clone(),
        Data::Error(value) => value.to_string(),
    }
}

fn normalize_text(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn is_extractable_text(text: &str) -> bool {
    let alpha_numeric_count = text
        .chars()
        .filter(|character| character.is_alphanumeric())
        .count();

    alpha_numeric_count >= 16
}

fn hash_content(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    hex::encode(hasher.finalize())
}

impl SourceChunkDraft {
    fn new(chunk_index: usize, content: String) -> Self {
        Self {
            chunk_index,
            content_hash: hash_content(&content),
            content,
            page_number: None,
            sheet_name: None,
            row_start: None,
            row_end: None,
            column_start: None,
            column_end: None,
            heading_path: None,
        }
    }

    fn with_pdf_page(mut self, page_number: usize) -> Self {
        self.page_number = Some(page_number as i64);
        self
    }

    fn with_csv_rows(mut self, row_start: i64, row_end: i64) -> Self {
        self.row_start = Some(row_start);
        self.row_end = Some(row_end);
        self
    }

    fn with_spreadsheet_location(
        mut self,
        sheet_name: String,
        row_number: i64,
        column_count: i64,
    ) -> Self {
        self.sheet_name = Some(sheet_name);
        self.row_start = Some(row_number);
        self.row_end = Some(row_number);
        self.column_start = Some(1);
        self.column_end = Some(column_count);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn sample_path(file_name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("samples")
            .join("phase-0")
            .join(file_name)
    }

    #[test]
    fn reads_markdown_with_heading_paths() {
        let result = read_source_file(&sample_path("hearing-memo.md"));

        assert_eq!(result.status, "read");
        assert!(result
            .chunks
            .iter()
            .any(|chunk| chunk.heading_path.as_deref() == Some("Hearing Memo Sample")));
    }

    #[test]
    fn reads_shift_jis_csv() {
        let result = read_source_file(&sample_path("channels-shift-jis.csv"));

        assert_eq!(result.status, "read");
        assert!(result
            .chunks
            .iter()
            .any(|chunk| chunk.content.contains("EC")));
    }

    #[test]
    fn reads_excel_sheet_locations() {
        let result = read_source_file(&sample_path("sample-workbook.xlsx"));

        assert_eq!(result.status, "read");
        assert!(result
            .chunks
            .iter()
            .any(|chunk| chunk.sheet_name.as_deref() == Some("Touchpoints")));
    }

    #[test]
    fn detects_scanned_placeholder_as_unreadable() {
        let result = read_source_file(&sample_path("scanned-placeholder.pdf"));

        assert_eq!(result.status, "unreadable");
        assert!(result.chunks.is_empty());
    }
}
