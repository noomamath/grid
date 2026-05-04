import { CellGridEditor } from "@/editors/cell-grid/CellGridEditor";

export default function Home() {
  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col">
      <CellGridEditor />
    </main>
  );
}
