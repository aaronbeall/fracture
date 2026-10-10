import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useFracture } from "../src/react";

function Trigger({ enabled }: { enabled: boolean }) {
  useFracture({ enabled });
  return null;
}

function App() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <h1>Keyboard-trigger example</h1>
      <p>
        Type “ya done messed up aaron!” to activate. Escape restores the page.
      </p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        Enable trigger
      </label>{" "}
      <button onClick={() => setMounted((value) => !value)}>
        {mounted ? "Unmount" : "Mount"} trigger
      </button>
      <p>
        <label>
          Try typing here <input aria-label="Sequence input" />
        </label>
      </p>
      {mounted && <Trigger enabled={enabled} />}
      <section aria-label="Sample surface">
        <h2>Click to fracture</h2>
        <p>This is an ordinary DOM surface.</p>
      </section>
      <p>
        <button>Another surface</button>
      </p>
      <a href="./index.html">All examples</a>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
