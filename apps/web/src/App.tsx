import { useEffect, useState } from "react";
import { cardStatus } from "@workbench/shared";
import { columnLabel } from "./columns.ts";

// Placeholder shell: proves the web app, the shared package and the API are wired together.
export function App() {
  const [api, setApi] = useState<"checking" | "up" | "down">("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => setApi(res.ok ? "up" : "down"))
      .catch(() => setApi("down"));
  }, []);

  return (
    <main>
      <h1>Workbench</h1>
      <p>API: {api}</p>
      <ol>
        {cardStatus.options.map((s) => (
          <li key={s}>{columnLabel(s)}</li>
        ))}
      </ol>
    </main>
  );
}
