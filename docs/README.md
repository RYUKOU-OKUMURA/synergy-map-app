# Docs Index

このディレクトリは、現在の正本と参考資料を混ぜないために用途別に整理する。

## まず読む

- [project-context.md](project-context.md): Codex / サブエージェント用の入口資料
- [mvp-spec.md](mvp-spec.md): MVP-1の要約仕様
- [requirements.md](requirements.md): 要件定義の正本
- [tech-stack.md](tech-stack.md): 技術選定の正本

## ディレクトリ

- [plans/](plans/): 現行フェーズの実装計画と進捗チェックリスト
  - [plans/trial-operation-phase-1.md](plans/trial-operation-phase-1.md): Phase 1本人試験運用チェックリスト
  - [plans/trial-operation-phase-2.md](plans/trial-operation-phase-2.md): Phase 2実事業試験運用チェックリスト
  - [plans/post-mvp-priority-plan.md](plans/post-mvp-priority-plan.md): MVP-1後の実装優先順位メモ。進捗チェックリストの正本ではなく、着手順の判断材料
- [design/](design/): UI、マップ表現、演出などの設計仕様
- [product/](product/): プロダクト思想、競合、ポジショニング
- [future/](future/): MVP-1後の将来構想
  - [future/hypothesis-validation-loop-future-concept.md](future/hypothesis-validation-loop-future-concept.md): 追加調査用プロンプトと選ばれる理由の仮説検査の構想メモ
- [operations/](operations/): 開発・運用メモ
- [incidents/](incidents/): 調査ログ、障害、再発防止メモ
- [archive/](archive/): 完了済み検証、旧構想、古い計画
- [adr/](adr/): 重要な意思決定記録
- [assets/](assets/): ドキュメント用画像

## 運用ルール

- 作業開始時は [project-context.md](project-context.md) を読む。
- すべてのドキュメントを毎回読まない。
- 実装進捗は [plans/](plans/) のチェックボックスを正本にする。
- `archive/` は原則として参照用であり、現在の仕様判断では正本にしない。
