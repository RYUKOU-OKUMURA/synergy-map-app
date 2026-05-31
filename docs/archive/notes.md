# Notes

## Initial Questions

- 技術スタックを何にするか → Tauri + React + TypeScript + Viteを第一候補にする
- PDF/CSV/スプレッドシート読み取りをどの層で処理するか → Tauri/Rust backend側を第一候補にする
- Codex App Serverをローカル前提で使うか、Webアプリ統合前提で使うか → ローカル起動のデスクトップ統合を第一候補にする
- シナジーマップ描画ライブラリを何にするか → React Flowを第一候補にする
- PDF出力をサーバー側で生成するか、ブラウザ側で生成するか → Typst sidecarによるPDF生成を第一候補にする

## Candidate Tech

- Desktop: Tauri
- Frontend: React / TypeScript / Vite
- Graph UI: React Flow
- Data model: source_chunks / item_sources / ai_runs / nodes / edges / snapshots / suggestions
- Export: PDF / Markdown / CSV
- AI integration: Codex App Server
- Codex transport: stdio
- Local storage: SQLite
- PDF engine: Typst sidecar

## MVP-1 Cut

- 顧客導線ビューのみ
- Markdown / CSVを必須出力にする
- PDFはレポート型1テンプレートだけ
- バージョン比較、事業・収益ビュー、ダッシュボードPDFはBeta以降
- Phase 0は技術ゲートとして扱う
