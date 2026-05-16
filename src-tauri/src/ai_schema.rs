#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SCHEMA_VERSION: &str = "phase0.v1";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItemsOutput {
    pub schema_version: String,
    pub items: Vec<ExtractedItem>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItem {
    pub label: String,
    pub category: String,
    pub evidence: String,
    pub confidence: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapDraftOutput {
    pub schema_version: String,
    pub nodes: Vec<MapNodeDraft>,
    pub edges: Vec<MapEdgeDraft>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapNodeDraft {
    pub label: String,
    pub node_type: String,
    pub description: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEdgeDraft {
    pub source_label: String,
    pub target_label: String,
    pub edge_type: String,
    pub evidence: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisOutput {
    pub schema_version: String,
    pub summary: String,
    pub opportunities: Vec<Opportunity>,
    pub risks: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunity {
    pub title: String,
    pub rationale: String,
    pub expected_impact: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionCardsOutput {
    pub schema_version: String,
    pub cards: Vec<SuggestionCard>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionCard {
    pub title: String,
    pub action: String,
    pub priority: String,
}

pub fn ai_analysis_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schemaVersion", "summary", "opportunities", "risks"],
        "properties": {
            "schemaVersion": {
                "type": "string",
                "const": SCHEMA_VERSION
            },
            "summary": {
                "type": "string",
                "minLength": 1
            },
            "opportunities": {
                "type": "array",
                "minItems": 1,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["title", "rationale", "expectedImpact"],
                    "properties": {
                        "title": { "type": "string", "minLength": 1 },
                        "rationale": { "type": "string", "minLength": 1 },
                        "expectedImpact": { "type": "string", "minLength": 1 }
                    }
                }
            },
            "risks": {
                "type": "array",
                "items": { "type": "string" }
            }
        }
    })
}

pub fn validate_ai_analysis_json(value: &Value) -> Result<AiAnalysisOutput, String> {
    let output: AiAnalysisOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    if output.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported schema_version: {}",
            output.schema_version
        ));
    }

    if output.summary.trim().is_empty() {
        return Err("summary is required.".to_string());
    }

    if output.opportunities.is_empty() {
        return Err("at least one opportunity is required.".to_string());
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_ai_analysis_output_deserializes() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "summary": "既存顧客とEC導線を連携できる。",
            "opportunities": [{
                "title": "定期便強化",
                "rationale": "購買履歴を使えるため。",
                "expectedImpact": "継続率向上"
            }],
            "risks": ["実資料で追加確認が必要"]
        });

        let output = validate_ai_analysis_json(&value).expect("output should validate");

        assert_eq!(output.schema_version, SCHEMA_VERSION);
    }

    #[test]
    fn schema_version_is_required() {
        let value = json!({
            "schemaVersion": "old",
            "summary": "summary",
            "opportunities": [{
                "title": "title",
                "rationale": "why",
                "expectedImpact": "impact"
            }],
            "risks": []
        });

        let error = validate_ai_analysis_json(&value).expect_err("version should fail");

        assert!(error.contains("Unsupported schema_version"));
    }
}
