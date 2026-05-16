# Phase 0 Codex App Server sidecar検証

作成日: 2026-05-16

## 一次判断

Phase 0 / MVP-1初期は、製品バンドル内sidecarではなく、PATH上の`codex` CLIを前提に進める。

理由:

- Tauri v2のsidecar同梱自体は可能。公式ドキュメントでは`bundle.externalBin`に相対パスを指定し、実ファイル名は`-$TARGET_TRIPLE`接尾辞付きで配置する必要がある。
- 現在の`codex`は自己完結したネイティブ実行ファイルではなく、npm package `@openai/codex`の`bin/codex.js`をNode.jsで実行する構成。
- 単純に`codex.js`だけをsidecar化してもNode.js runtimeと同梱ファイルの扱いが残る。製品配布で安定させるには、公式standalone binary、またはNode.js runtime込みの明示的な同梱設計が必要。
- Codex App Server protocolは`codex-cli 0.130.0`で検証しているため、同梱する場合はアプリ側schemaとsidecar versionの追従方針が必要。

## 確認した現在の実行環境

- `codex`: `/Users/ryukouokumura/.nvm/versions/node/v24.13.0/bin/codex`
- 実体: `/Users/ryukouokumura/.nvm/versions/node/v24.13.0/lib/node_modules/@openai/codex/bin/codex.js`
- 種別: `/usr/bin/env node` script
- version: `codex-cli 0.130.0`
- package: `@openai/codex` version `0.130.0`
- license: `Apache-2.0`
- node engine: `>=16`
- host target: `aarch64-apple-darwin`

## Tauri sidecar配置方針

Tauri v2公式ドキュメント:

- <https://v2.tauri.app/ja/develop/sidecar/>

sidecarを使う場合の設定例:

```json
{
  "bundle": {
    "externalBin": ["binaries/codex-app-server"]
  }
}
```

この場合の配置候補:

- macOS Apple Silicon: `src-tauri/binaries/codex-app-server-aarch64-apple-darwin`
- Windows x64 MSVC: `src-tauri/binaries/codex-app-server-x86_64-pc-windows-msvc.exe`
- Linux x64 GNU: `src-tauri/binaries/codex-app-server-x86_64-unknown-linux-gnu`

Phase 0では実バイナリを配置しない。理由は、現在のCodex CLIがNode scriptであり、単一sidecar binaryとして扱う前提を満たしていないため。

## shell権限と実行範囲

現在の実装はTauri shell pluginを使わない。

- `src-tauri/capabilities/default.json`は`core:default`のみ。
- frontendに任意command実行権限はない。
- Codex起動はRust backendでPATH上の`codex`を探索し、`app-server --listen stdio://`の固定引数で起動する。
- Windows npm shimを想定し、探索候補は`codex.exe` / `codex.cmd` / `codex.bat` / `codex`とする。

このため、P0時点の実行範囲は「frontendから任意shellを起動させない」「backendで固定コマンドだけ起動する」方針。Tauri capabilitiesはfrontend権限の制御であり、Rust backendの`Command`実行を直接制限するものではない。

## 署名・更新・バージョン追従の課題

- macOS / Windows署名対象にsidecarを含める場合、main appとsidecarの署名・notarization・installer更新が一体で成功するか確認が必要。
- Codex App Serverのprotocol schemaとアプリ実装がずれると、`initialize`や`turn/start`が失敗する可能性がある。
- 起動時に`codex --version`を読み、検証済みversion範囲外ならUIで警告する必要がある。
- WindowsではPATH上のNode/npm/codex解決、企業PCの実行ポリシー、プロキシ、ブラウザ認証導線を実機で別途確認する必要がある。

## 代替導線

sidecar同梱がMVP-1開始時点で難しい場合:

1. アプリ起動時に`codex --version`を確認する。
2. 未検出または未対応versionの場合は、Codex CLIのインストール手順を表示する。
3. device-code flowでChatGPT認証を案内する。
4. Codex runtimeが利用可能になった後だけAI抽出機能を有効化する。
