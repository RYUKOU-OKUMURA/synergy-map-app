#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const SCHEMA_VERSION: &str = "mvp1.v1";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItemsOutput {
    pub schema_version: String,
    pub items: Vec<ExtractedItem>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItem {
    pub name: String,
    pub item_type: String,
    pub description: String,
    pub confidence_status: String,
    pub impact_score: i64,
    pub subjective_importance: i64,
    pub memo: Option<String>,
    pub sources: Vec<ExtractedItemSource>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedItemSource {
    pub source_chunk_id: Option<String>,
    pub source_file_id: Option<String>,
    pub quote: String,
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
    pub extracted_item_id: Option<String>,
    pub name: String,
    pub node_type: String,
    pub description: String,
    pub confidence_status: String,
    pub impact_score: i64,
    pub information_richness: i64,
    pub position_x: f64,
    pub position_y: f64,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEdgeDraft {
    pub source_node_label: String,
    pub target_node_label: String,
    pub edge_type: String,
    pub flow_type: String,
    pub strength: String,
    pub confidence_status: String,
    pub label: String,
    pub evidence: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisOutput {
    pub schema_version: String,
    pub summary: String,
    pub strong_flows: Vec<String>,
    pub bottlenecks: Vec<String>,
    pub unconnected_synergies: Vec<String>,
    pub questions: Vec<String>,
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
    pub rationale: String,
    pub expected_revenue_impact: String,
    pub expected_profit_impact: String,
    pub cost_level: String,
    pub effort_level: String,
    pub time_to_impact: String,
    pub confidence_status: String,
    pub impact_score: i64,
    pub evidence: String,
    pub related_node_labels: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct MapInsightOutput {
    pub schema_version: String,
    pub answer: String,
    pub key_points: Vec<String>,
    pub follow_up_questions: Vec<String>,
    pub confidence_status: String,
}

pub fn extracted_items_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schemaVersion", "items"],
        "properties": {
            "schemaVersion": { "type": "string", "const": SCHEMA_VERSION },
            "items": {
                "type": "array",
                "minItems": 1,
                "maxItems": 24,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "name",
                        "itemType",
                        "description",
                        "confidenceStatus",
                        "impactScore",
                        "subjectiveImportance",
                        "memo",
                        "sources"
                    ],
                    "properties": {
                        "name": { "type": "string", "minLength": 1 },
                        "itemType": {
                            "type": "string",
                            "enum": ["business", "service", "channel", "touchpoint", "finance", "data_source"]
                        },
                        "description": { "type": "string", "minLength": 1 },
                        "confidenceStatus": {
                            "type": "string",
                            "enum": ["confirmed", "estimated", "needs_review"]
                        },
                        "impactScore": { "type": "integer", "minimum": 1, "maximum": 3 },
                        "subjectiveImportance": { "type": "integer", "minimum": 1, "maximum": 3 },
                        "memo": { "type": ["string", "null"] },
                        "sources": {
                            "type": "array",
                            "minItems": 1,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "required": ["sourceChunkId", "sourceFileId", "quote"],
                                "properties": {
                                    "sourceChunkId": { "type": ["string", "null"] },
                                    "sourceFileId": { "type": ["string", "null"] },
                                    "quote": { "type": "string" }
                                }
                            }
                        }
                    }
                }
            }
        }
    })
}

pub fn map_draft_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schemaVersion", "nodes", "edges"],
        "properties": {
            "schemaVersion": { "type": "string", "const": SCHEMA_VERSION },
            "nodes": {
                "type": "array",
                "minItems": 1,
                "maxItems": 32,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "extractedItemId",
                        "name",
                        "nodeType",
                        "description",
                        "confidenceStatus",
                        "impactScore",
                        "informationRichness",
                        "positionX",
                        "positionY"
                    ],
                    "properties": {
                        "extractedItemId": { "type": ["string", "null"] },
                        "name": { "type": "string", "minLength": 1 },
                        "nodeType": {
                            "type": "string",
                            "enum": ["business", "service", "channel", "touchpoint", "finance", "data_source"]
                        },
                        "description": { "type": "string" },
                        "confidenceStatus": {
                            "type": "string",
                            "enum": ["confirmed", "estimated", "needs_review"]
                        },
                        "impactScore": { "type": "integer", "minimum": 1, "maximum": 3 },
                        "informationRichness": { "type": "integer", "minimum": 0, "maximum": 100 },
                        "positionX": { "type": "number" },
                        "positionY": { "type": "number" }
                    }
                }
            },
            "edges": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "sourceNodeLabel",
                        "targetNodeLabel",
                        "edgeType",
                        "flowType",
                        "strength",
                        "confidenceStatus",
                        "label",
                        "evidence"
                    ],
                    "properties": {
                        "sourceNodeLabel": { "type": "string", "minLength": 1 },
                        "targetNodeLabel": { "type": "string", "minLength": 1 },
                        "edgeType": {
                            "type": "string",
                            "enum": ["strong", "normal", "weak", "bottleneck", "data_reference"]
                        },
                        "flowType": {
                            "type": "string",
                            "enum": ["awareness", "inquiry", "proposal", "purchase", "retention", "referral", "data_reference"]
                        },
                        "strength": { "type": "string", "enum": ["strong", "normal", "weak"] },
                        "confidenceStatus": {
                            "type": "string",
                            "enum": ["confirmed", "estimated", "needs_review"]
                        },
                        "label": { "type": "string" },
                        "evidence": { "type": "string" }
                    }
                }
            }
        }
    })
}

pub fn ai_analysis_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": [
            "schemaVersion",
            "summary",
            "strongFlows",
            "bottlenecks",
            "unconnectedSynergies",
            "questions",
            "opportunities",
            "risks"
        ],
        "properties": {
            "schemaVersion": {
                "type": "string",
                "const": SCHEMA_VERSION
            },
            "summary": {
                "type": "string",
                "minLength": 1
            },
            "strongFlows": {
                "type": "array",
                "items": { "type": "string" }
            },
            "bottlenecks": {
                "type": "array",
                "items": { "type": "string" }
            },
            "unconnectedSynergies": {
                "type": "array",
                "items": { "type": "string" }
            },
            "questions": {
                "type": "array",
                "items": { "type": "string" }
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

pub fn suggestion_cards_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["schemaVersion", "cards"],
        "properties": {
            "schemaVersion": { "type": "string", "const": SCHEMA_VERSION },
            "cards": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": [
                        "title",
                        "action",
                        "priority",
                        "rationale",
                        "expectedRevenueImpact",
                        "expectedProfitImpact",
                        "costLevel",
                        "effortLevel",
                        "timeToImpact",
                        "confidenceStatus",
                        "impactScore",
                        "evidence",
                        "relatedNodeLabels"
                    ],
                    "properties": {
                        "title": { "type": "string", "minLength": 1 },
                        "action": { "type": "string", "minLength": 1 },
                        "priority": { "type": "string", "enum": ["high", "medium", "low"] },
                        "rationale": { "type": "string", "minLength": 1 },
                        "expectedRevenueImpact": {
                            "type": "string",
                            "enum": ["high", "medium", "low", "unknown"]
                        },
                        "expectedProfitImpact": {
                            "type": "string",
                            "enum": ["high", "medium", "low", "unknown"]
                        },
                        "costLevel": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "unknown"]
                        },
                        "effortLevel": {
                            "type": "string",
                            "enum": ["low", "medium", "high", "unknown"]
                        },
                        "timeToImpact": {
                            "type": "string",
                            "enum": ["short", "mid", "long", "unknown"]
                        },
                        "confidenceStatus": {
                            "type": "string",
                            "enum": ["confirmed", "estimated", "needs_review"]
                        },
                        "impactScore": { "type": "integer", "minimum": 0, "maximum": 100 },
                        "evidence": { "type": "string", "minLength": 1 },
                        "relatedNodeLabels": {
                            "type": "array",
                            "items": { "type": "string" },
                            "maxItems": 6
                        }
                    }
                }
            }
        }
    })
}

pub fn map_insight_json_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": [
            "schemaVersion",
            "answer",
            "keyPoints",
            "followUpQuestions",
            "confidenceStatus"
        ],
        "properties": {
            "schemaVersion": { "type": "string", "const": SCHEMA_VERSION },
            "answer": { "type": "string", "minLength": 1 },
            "keyPoints": {
                "type": "array",
                "minItems": 1,
                "maxItems": 5,
                "items": { "type": "string", "minLength": 1 }
            },
            "followUpQuestions": {
                "type": "array",
                "maxItems": 5,
                "items": { "type": "string", "minLength": 1 }
            },
            "confidenceStatus": {
                "type": "string",
                "enum": ["confirmed", "estimated", "needs_review"]
            }
        }
    })
}

pub fn validate_extracted_items_json(value: &Value) -> Result<ExtractedItemsOutput, String> {
    let output: ExtractedItemsOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    ensure_schema_version(&output.schema_version)?;

    if output.items.is_empty() {
        return Err("at least one extracted item is required.".to_string());
    }

    for item in &output.items {
        ensure_non_empty("item.name", &item.name)?;
        ensure_allowed(
            "item.item_type",
            &item.item_type,
            &[
                "business",
                "service",
                "channel",
                "touchpoint",
                "finance",
                "data_source",
            ],
        )?;
        ensure_allowed(
            "item.confidence_status",
            &item.confidence_status,
            &["confirmed", "estimated", "needs_review"],
        )?;
        ensure_score("impact_score", item.impact_score, 1, 3)?;
        ensure_score("subjective_importance", item.subjective_importance, 1, 3)?;
        if item.sources.is_empty() {
            return Err("item.sources must include at least one source.".to_string());
        }
        for source in &item.sources {
            if source.source_chunk_id.is_none() && source.source_file_id.is_none() {
                return Err(
                    "item source must include source_chunk_id or source_file_id.".to_string(),
                );
            }
            ensure_non_empty("item.source.quote", &source.quote)?;
        }
    }

    Ok(output)
}

pub fn validate_map_draft_json(value: &Value) -> Result<MapDraftOutput, String> {
    let output: MapDraftOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    ensure_schema_version(&output.schema_version)?;

    if output.nodes.is_empty() {
        return Err("at least one map node is required.".to_string());
    }

    for node in &output.nodes {
        ensure_non_empty("node.name", &node.name)?;
        ensure_allowed(
            "node.node_type",
            &node.node_type,
            &[
                "business",
                "service",
                "channel",
                "touchpoint",
                "finance",
                "data_source",
            ],
        )?;
        ensure_allowed(
            "node.confidence_status",
            &node.confidence_status,
            &["confirmed", "estimated", "needs_review"],
        )?;
        ensure_score("impact_score", node.impact_score, 1, 3)?;
        ensure_score("information_richness", node.information_richness, 0, 100)?;
    }

    Ok(output)
}

pub fn validate_ai_analysis_json(value: &Value) -> Result<AiAnalysisOutput, String> {
    let output: AiAnalysisOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    ensure_schema_version(&output.schema_version)?;

    if output.summary.trim().is_empty() {
        return Err("summary is required.".to_string());
    }

    if output.opportunities.is_empty() {
        return Err("at least one opportunity is required.".to_string());
    }

    Ok(output)
}

pub fn validate_suggestion_cards_json(value: &Value) -> Result<SuggestionCardsOutput, String> {
    let output: SuggestionCardsOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    ensure_schema_version(&output.schema_version)?;

    if output.cards.is_empty() {
        return Err("at least one suggestion card is required.".to_string());
    }

    for card in &output.cards {
        ensure_non_empty("card.title", &card.title)?;
        ensure_non_empty("card.action", &card.action)?;
        ensure_non_empty("card.rationale", &card.rationale)?;
        ensure_non_empty("card.evidence", &card.evidence)?;
        ensure_allowed("card.priority", &card.priority, &["high", "medium", "low"])?;
        ensure_allowed(
            "card.expected_revenue_impact",
            &card.expected_revenue_impact,
            &["high", "medium", "low", "unknown"],
        )?;
        ensure_allowed(
            "card.expected_profit_impact",
            &card.expected_profit_impact,
            &["high", "medium", "low", "unknown"],
        )?;
        ensure_allowed(
            "card.cost_level",
            &card.cost_level,
            &["low", "medium", "high", "unknown"],
        )?;
        ensure_allowed(
            "card.effort_level",
            &card.effort_level,
            &["low", "medium", "high", "unknown"],
        )?;
        ensure_allowed(
            "card.time_to_impact",
            &card.time_to_impact,
            &["short", "mid", "long", "unknown"],
        )?;
        ensure_allowed(
            "card.confidence_status",
            &card.confidence_status,
            &["confirmed", "estimated", "needs_review"],
        )?;
        ensure_score("impact_score", card.impact_score, 0, 100)?;
    }

    Ok(output)
}

pub fn validate_map_insight_json(value: &Value) -> Result<MapInsightOutput, String> {
    let output: MapInsightOutput =
        serde_json::from_value(value.clone()).map_err(|error| error.to_string())?;

    ensure_schema_version(&output.schema_version)?;
    ensure_non_empty("answer", &output.answer)?;
    if output.key_points.is_empty() {
        return Err("key_points must include at least one item.".to_string());
    }
    for point in &output.key_points {
        ensure_non_empty("key_points", point)?;
    }
    for question in &output.follow_up_questions {
        ensure_non_empty("follow_up_questions", question)?;
    }
    if output.key_points.len() > 5 {
        return Err("key_points must include at most 5 items.".to_string());
    }
    if output.follow_up_questions.len() > 5 {
        return Err("follow_up_questions must include at most 5 items.".to_string());
    }
    ensure_allowed(
        "confidence_status",
        &output.confidence_status,
        &["confirmed", "estimated", "needs_review"],
    )?;

    Ok(output)
}

fn ensure_schema_version(schema_version: &str) -> Result<(), String> {
    if schema_version != SCHEMA_VERSION {
        return Err(format!("Unsupported schema_version: {schema_version}"));
    }

    Ok(())
}

fn ensure_non_empty(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field} is required."));
    }

    Ok(())
}

fn ensure_allowed(field: &str, value: &str, allowed: &[&str]) -> Result<(), String> {
    if allowed.iter().any(|allowed_value| allowed_value == &value) {
        return Ok(());
    }

    Err(format!("{field} has unsupported value: {value}"))
}

fn ensure_score(field: &str, value: i64, min: i64, max: i64) -> Result<(), String> {
    if (min..=max).contains(&value) {
        return Ok(());
    }

    Err(format!("{field} must be between {min} and {max}."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_ai_analysis_output_deserializes() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "summary": "既存顧客とEC導線を連携できる。",
            "strongFlows": ["店舗からECへの再購入導線"],
            "bottlenecks": ["初回商談後の継続接点が弱い"],
            "unconnectedSynergies": ["顧客台帳とLINE配信"],
            "questions": ["継続率を資料で確認できますか？"],
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
            "strongFlows": [],
            "bottlenecks": [],
            "unconnectedSynergies": [],
            "questions": [],
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

    #[test]
    fn valid_business_impact_suggestion_deserializes() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "cards": [{
                "title": "問い合わせ後フォロー導線の整理",
                "action": "担当、期限、記録先を決める。",
                "priority": "high",
                "rationale": "売上入口に近い詰まりを解消するため。",
                "expectedRevenueImpact": "high",
                "expectedProfitImpact": "medium",
                "costLevel": "low",
                "effortLevel": "low",
                "timeToImpact": "short",
                "confidenceStatus": "estimated",
                "impactScore": 82,
                "evidence": "sourceChunkId=chunk-1 の顧客接点情報から推定。",
                "relatedNodeLabels": ["Web問い合わせ", "初回商談"]
            }]
        });

        let output = validate_suggestion_cards_json(&value).expect("suggestion should validate");

        assert_eq!(output.cards[0].impact_score, 82);
        assert_eq!(output.cards[0].related_node_labels.len(), 2);
    }

    #[test]
    fn business_impact_suggestion_rejects_invalid_score() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "cards": [{
                "title": "問い合わせ後フォロー導線の整理",
                "action": "担当、期限、記録先を決める。",
                "priority": "high",
                "rationale": "売上入口に近い詰まりを解消するため。",
                "expectedRevenueImpact": "high",
                "expectedProfitImpact": "medium",
                "costLevel": "low",
                "effortLevel": "low",
                "timeToImpact": "short",
                "confidenceStatus": "estimated",
                "impactScore": 120,
                "evidence": "sourceChunkId=chunk-1 の顧客接点情報から推定。",
                "relatedNodeLabels": ["Web問い合わせ"]
            }]
        });

        let error =
            validate_suggestion_cards_json(&value).expect_err("score outside range should fail");

        assert!(error.contains("impact_score"));
    }

    #[test]
    fn map_insight_rejects_unknown_fields() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "answer": "このノードは問い合わせ導線の確認対象です。",
            "keyPoints": ["接点の意味を確認する"],
            "followUpQuestions": ["担当者は誰ですか？"],
            "confidenceStatus": "estimated",
            "unexpected": "reject me"
        });

        let error = validate_map_insight_json(&value).expect_err("unknown field should fail");

        assert!(error.contains("unknown field"));
    }

    #[test]
    fn map_insight_rejects_too_many_key_points() {
        let value = json!({
            "schemaVersion": SCHEMA_VERSION,
            "answer": "このノードは問い合わせ導線の確認対象です。",
            "keyPoints": ["1", "2", "3", "4", "5", "6"],
            "followUpQuestions": [],
            "confidenceStatus": "estimated"
        });

        let error = validate_map_insight_json(&value).expect_err("too many points should fail");

        assert!(error.contains("key_points"));
    }
}
