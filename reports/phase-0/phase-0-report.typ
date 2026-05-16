#set document(title: "Synergy Map Phase 0 技術検証レポート")
#set page(
  paper: "a4",
  flipped: true,
  margin: (x: 18mm, y: 15mm),
)
#set text(font: "BIZ UDGothic", size: 10pt, lang: "ja")
#set heading(numbering: none)

#let section-title(body) = {
  v(5mm)
  text(size: 15pt, weight: "bold", fill: rgb("#18201b"), body)
  line(length: 100%, stroke: rgb("#dfe5dc"))
  v(2mm)
}

#let metric(label, value, note) = box(
  width: 31%,
  inset: 10pt,
  radius: 4pt,
  stroke: rgb("#dfe5dc"),
  fill: rgb("#f8faf6"),
)[
  #text(size: 8pt, fill: rgb("#667066"))[#label]
  #parbreak()
  #text(size: 14pt, weight: "bold")[#value]
  #parbreak()
  #text(size: 8pt, fill: rgb("#667066"))[#note]
]

#align(left)[
  #text(size: 21pt, weight: "bold")[Synergy Map Phase 0 技術検証レポート]
  #parbreak()
  #text(fill: rgb("#667066"))[完成アプリではなく、技術検証済みの最小デスクトップPoC + Go/No-Go判断レポート。]
]

#v(6mm)

#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 6mm,
  metric("Desktop", "Tauri + React", "macOSで起動確認"),
  metric("Codex", "stdio OK", "turn/startまで確認"),
  metric("判定", "条件付きGo", "macOS PoC継続"),
)

#section-title[顧客接点シナジーマップ]

#image("phase-0-synergy-map.png", width: 100%, height: 82mm, fit: "contain")

#pagebreak()
#section-title[検証サマリー]

#table(
  columns: (34mm, 22mm, 1fr),
  stroke: rgb("#dfe5dc"),
  inset: 7pt,
  table.header(
    [項目],
    [判定],
    [メモ],
  ),
  [SQLite保存],
  [Go],
  [案件作成、再起動後の永続化、migration再実行を確認。],
  [資料読み取り],
  [暫定Go],
  [PDF / Excel / CSV / Markdown / textを読み取り、スキャンPDFはunreadableとして扱う。],
  [Codex接続],
  [暫定Go],
  [App Server stdioでinitialize、account/read、thread/start、turn/startを確認。],
  [device-code],
  [条件付き],
  [URL/code発行とキャンセルを確認。認証完了通知の実受信は未確認。],
  [PDF出力],
  [Go],
  [Typstで日本語本文とマップ画像を含むPDFを生成。],
  [AI schema],
  [Go],
  [JSON Schema付きturnを実行し、serde検証後だけai_runsへ保存。],
  [情報管理],
  [Go],
  [既定送信モードは要約のみ。資料本文とprompt全文は履歴に保存しない。],
  [Windows],
  [未確認],
  [実機確認、既定ブラウザ導線、フォント、sidecar起動はMVP-1配布前ゲート。],
)

#section-title[Go / No-Go判断]

MVP-1の設計とmacOS PoC継続は条件付きGo。Windows配布、実利用者検証、Codex App Server sidecar同梱は未確認ゲートが残るため、現時点ではGoにしない。

#section-title[フォント運用]

- macOS検証では`BIZ UDGothic`で日本語本文が文字化けしないことを確認。
- Windows配布ではBIZ UD系フォントの利用可能性を確認し、未搭載環境には同梱フォントまたは代替フォント指定を用意する。
- PDFテンプレートでは日本語フォントを明示指定し、OS既定フォントへの暗黙依存を避ける。
