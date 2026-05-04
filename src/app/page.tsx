import { NoomaGridEditor } from "@/editors/grid/NoomaGridEditor";

export default function Home() {
  return (
    <main className="relative flex min-h-[100dvh] flex-1 flex-col">
      <NoomaGridEditor />
    </main>
  );
}
