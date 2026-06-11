import { Sparkles } from "lucide-react";
import { useMemo } from "react";

import {
  costLevelOptions,
  impactLevelOptions,
  labelFor,
  priorityOptions,
  timeToImpactOptions,
} from "@/lib/mvp1Labels";
import type { ProjectWorkspace } from "@/lib/mvp1Types";
import { priorityRank } from "@/lib/priorityRank";

export function SuggestionsView({
  onGenerate,
  onSelectSuggestion,
  selectedSuggestionId,
  workspace,
}: {
  onGenerate: () => void;
  onSelectSuggestion: (suggestionId: string) => void;
  selectedSuggestionId: string | null;
  workspace: ProjectWorkspace;
}) {
  const suggestions = useMemo(
    () =>
      [...workspace.suggestions].sort(
        (left, right) =>
          right.impactScore - left.impactScore ||
          priorityRank(left.priority) - priorityRank(right.priority),
      ),
    [workspace.suggestions],
  );

  return (
    <section className="page-panel">
      <div className="page-header">
        <div>
          <h1>次の一手</h1>
          <p>売上・利益・費用・工数への効き方を根拠付きで確認します。</p>
        </div>
        <button className="primary-button" onClick={onGenerate} type="button">
          <Sparkles size={15} aria-hidden="true" />
          評価生成
        </button>
      </div>
      <div className="cards-grid">
        {suggestions.map((suggestion) => (
          <button
            className={`review-card impact-review-card ${
              selectedSuggestionId === suggestion.id ? "review-card-selected" : ""
            }`}
            key={suggestion.id}
            onClick={() => onSelectSuggestion(suggestion.id)}
            type="button"
          >
            <div className="card-row">
              <strong>{suggestion.title}</strong>
              <span className="status-chip">
                {labelFor(priorityOptions, suggestion.priority)}
              </span>
            </div>
            <p>{suggestion.description}</p>
            <div className="impact-metrics">
              <span>
                売上 {labelFor(impactLevelOptions, suggestion.expectedRevenueImpact)}
              </span>
              <span>
                利益 {labelFor(impactLevelOptions, suggestion.expectedProfitImpact)}
              </span>
              <span>費用 {labelFor(costLevelOptions, suggestion.costLevel)}</span>
              <span>工数 {labelFor(costLevelOptions, suggestion.effortLevel)}</span>
              <span>時期 {labelFor(timeToImpactOptions, suggestion.timeToImpact)}</span>
            </div>
            <small>{suggestion.evidence ?? suggestion.rationale}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
