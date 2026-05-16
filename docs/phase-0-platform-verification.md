# Phase 0 macOS / Windows確認

作成日: 2026-05-16

## macOS確認

環境:

- macOS / Apple Silicon
- `node v24.13.0`
- `pnpm 10.30.1`
- `rustc 1.90.0`
- `codex-cli 0.130.0`
- `typst 0.14.2`

確認結果:

- `pnpm tauri dev`でdev buildが起動する。
- アプリデータDBは`~/Library/Application Support/com.synergymap.app/synergy-map.db`に作成される。
- SQLiteへのproject保存、再起動後の永続化、migration再実行、drift検知を確認済み。
- サンプル資料の投入、source chunks保存、出典情報保存を確認済み。
- Codex App Serverは`codex app-server --listen stdio://`でstdio起動し、短いturn、device-code発行、schema付きturnを確認済み。
- Typstで日本語2ページPDFを生成できる。
- React Flow出力PNGは`2188x840px`で、PDFへ埋め込み可能。

2026-05-16再確認:

- `pnpm tauri dev`: 起動成功。
- `typst compile reports/phase-0/phase-0-report.typ reports/phase-0/phase-0-report.pdf`: 成功。
- `file reports/phase-0/phase-0-report.pdf`: PDF 1.7、2 pages。
- `file reports/phase-0/phase-0-synergy-map.png`: PNG、2188 x 840。
- `codex --version`: `codex-cli 0.130.0`。

## Windows確認

この作業環境はmacOSのため、Windows実機確認は未実施。

WindowsでMVP-1開始前に確認する項目:

- `pnpm tauri dev`でウィンドウが起動する。
- Tauri prerequisites: Microsoft C++ Build Tools、WebView2 Runtime、MSVC Rust toolchain。
- DB保存場所: `%APPDATA%\\com.synergymap.app\\synergy-map.db`。
- PATH上のCodex shim: `codex.exe` / `codex.cmd` / `codex.bat`。
- ChatGPT device-code flowで既定ブラウザにURLを開ける。
- Typst日本語フォント: BIZ UD系フォントの有無、または同梱/代替フォント。
- PDF出力とReact Flow PNG埋め込み。
- Windows Defender / SmartScreen / 署名まわりの配布影響。

## 判定

macOS PoCはPhase 0の技術検証として成立。

Windowsは未実機確認のため、Phase 0時点では「MVP-1設計へ条件付きGo」とする。Windows向け配布またはユーザー検証に入る前に、上記確認を必須タスクとして扱う。

