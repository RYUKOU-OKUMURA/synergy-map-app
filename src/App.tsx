import {
  CheckCircle2,
  Database,
  FileText,
  FolderKanban,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import "./App.css";
import { Button } from "@/components/ui/button";

const placeholderProjects = [
  {
    name: "サンプル株式会社 事業整理",
    status: "準備中",
    files: 0,
    updatedAt: "未作成",
  },
  {
    name: "新規案件テンプレート",
    status: "プレースホルダー",
    files: 0,
    updatedAt: "Phase 0",
  },
];

const gateItems = [
  {
    label: "Tauri + React + Vite",
    value: "起動検証中",
    icon: CheckCircle2,
  },
  {
    label: "SQLite保存",
    value: "P0-3で検証",
    icon: Database,
  },
  {
    label: "Codex接続",
    value: "P0-5で検証",
    icon: Sparkles,
  },
  {
    label: "資料読み取り",
    value: "P0-4で検証",
    icon: FileText,
  },
];

function App() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="grid min-h-screen grid-cols-[248px_1fr]">
        <aside className="border-r border-[var(--app-border)] bg-white px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-[var(--app-accent)] text-white">
              <FolderKanban size={20} aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold">Synergy Map</div>
              <div className="text-xs text-[var(--app-muted)]">Phase 0 PoC</div>
            </div>
          </div>

          <nav className="mt-8 space-y-1 text-sm">
            <a className="nav-item nav-item-active" href="#projects">
              <FolderKanban size={16} aria-hidden="true" />
              案件一覧
            </a>
            <a className="nav-item" href="#sources">
              <FileText size={16} aria-hidden="true" />
              資料投入
            </a>
            <a className="nav-item" href="#go-no-go">
              <ShieldCheck size={16} aria-hidden="true" />
              技術ゲート
            </a>
          </nav>
        </aside>

        <section className="px-8 py-6">
          <header className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] pb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                Desktop PoC
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal">案件一覧</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
                MVP-1へ進むための技術検証用シェルです。現時点では保存やAI連携を作り込まず、起動と画面構成を確認します。
              </p>
            </div>
            <Button type="button">
              <Plus size={16} aria-hidden="true" />
              新規案件
            </Button>
          </header>

          <div className="mt-6 grid grid-cols-4 gap-3">
            {gateItems.map((item) => {
              const Icon = item.icon;

              return (
                <div className="metric-card" key={item.label}>
                  <div className="flex items-center justify-between gap-3">
                    <Icon
                      className="text-[var(--app-accent)]"
                      size={18}
                      aria-hidden="true"
                    />
                    <span className="text-xs text-[var(--app-muted)]">
                      {item.value}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-medium">{item.label}</div>
                </div>
              );
            })}
          </div>

          <div
            className="mt-6 overflow-hidden rounded-md border border-[var(--app-border)] bg-white"
            id="projects"
          >
            <div className="grid grid-cols-[1fr_160px_120px_160px] border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-xs font-semibold text-[var(--app-muted)]">
              <div>案件名</div>
              <div>状態</div>
              <div>資料数</div>
              <div>更新</div>
            </div>
            {placeholderProjects.map((project) => (
              <div
                className="grid grid-cols-[1fr_160px_120px_160px] items-center border-b border-[var(--app-border)] px-4 py-4 text-sm last:border-b-0"
                key={project.name}
              >
                <div className="font-medium">{project.name}</div>
                <div>
                  <span className="status-pill">{project.status}</span>
                </div>
                <div className="text-[var(--app-muted)]">{project.files}</div>
                <div className="text-[var(--app-muted)]">{project.updatedAt}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
