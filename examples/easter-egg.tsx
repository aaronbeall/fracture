import { useState } from "react";
import { createRoot } from "react-dom/client";
import { useFractureEasterEgg } from "../src/react";
import type { Trigger } from "../src/easter-egg";

const choices: Record<string, { label: string; trigger: Trigger }> = {
  phrase: {
    label: "Type “ya done messed up aaron!”",
    trigger: { sequence: "ya done messed up aaron!" },
  },
  konami: { label: "Konami code: ↑ ↑ ↓ ↓ ← → ← → B A", trigger: "konami" },
  keys: { label: "Shortcut: Ctrl+Shift+F", trigger: { keys: "ctrl+shift+f" } },
  clicks: {
    label: "Click the logo 5 times",
    trigger: { clicks: 5, target: "#logo" },
  },
};

function EasterEgg({
  trigger,
  enabled,
}: {
  trigger: Trigger;
  enabled: boolean;
}) {
  const [status, setStatus] = useState("Armed");
  useFractureEasterEgg({
    enabled,
    triggers: [trigger],
    hud: { message: (n) => `${n} elements fractured. Escape to undo.` },
    onFracture: () => setStatus("Fracturing — Escape restores"),
    onExit: () => setStatus("Armed"),
  });
  return <output aria-live="polite">{enabled ? status : "Disabled"}</output>;
}

function App() {
  const [choice, setChoice] = useState("phrase");
  const [enabled, setEnabled] = useState(true);
  return (
    <>
      <section className="panel">
        <h2 id="logo" className="logo">
          ◆ Acme Corp
        </h2>
        <fieldset>
          <legend>Trigger</legend>
          {Object.entries(choices).map(([key, { label }]) => (
            <label key={key}>
              <input
                type="radio"
                name="trigger"
                checked={choice === key}
                onChange={() => setChoice(key)}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Enabled
          </label>
          {/* Triggers are read when the hook enables, so remount on change. */}
          <EasterEgg
            key={choice}
            trigger={choices[choice]!.trigger}
            enabled={enabled}
          />
        </div>
        <p>
          <label>
            Typing in fields still works normally{" "}
            <input aria-label="Try typing" />
          </label>
        </p>
      </section>
      <section className="panel sample">
        <h2>Click to fracture</h2>
        <p>Once active, this is an ordinary DOM surface waiting to happen.</p>
        <button>Another surface</button>
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
