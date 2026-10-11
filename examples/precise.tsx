import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createRoot } from "react-dom/client";
import { useFracture } from "../src/react";

function Modal({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { fracture } = useFracture();
  useEffect(() => dialog.current?.showModal(), []);

  async function destroy(event: MouseEvent) {
    // Break first, then unmount: the pieces keep flying on the shared stage.
    await fracture(dialog, { at: event });
    onClose();
  }

  return (
    <dialog ref={dialog} className="modal" onCancel={onClose}>
      <h2>Delete everything?</h2>
      <p className="muted">
        This action cannot be undone. Well, it can, but it will look like it
        can't.
      </p>
      <div className="row">
        <button className="danger" onClick={destroy}>
          Delete
        </button>
        <button className="secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

const icons = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  warning: (
    <>
      <path d="M12 3L2 20h20z" />
      <path d="M12 10v4M12 17v.5" />
    </>
  ),
  calendar: (
    <>
      <path d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5" />
    </>
  ),
};

interface Note {
  text: string;
  description: string;
  icon: keyof typeof icons;
  color: string;
}

const initialNotes: Note[] = [
  {
    text: "Your build passed",
    description: "All checks are green. This notification has served its purpose.",
    icon: "check",
    color: "#1a7f37",
  },
  {
    text: "3 new comments on your PR",
    description: "Two suggestions and one very strong opinion about semicolons.",
    icon: "comment",
    color: "#1f4fd8",
  },
  {
    text: "Disk space is running low",
    description: "Deleting this warning will free up absolutely no disk space.",
    icon: "warning",
    color: "#e63312",
  },
  {
    text: "Meeting moved to 3pm",
    description: "Same agenda. New time. An opportunity to clear your calendar.",
    icon: "calendar",
    color: "#b38f00",
  },
];

function Cards() {
  const [notes, setNotes] = useState(initialNotes);
  const [leaving, setLeaving] = useState(new Set<string>());
  const refs = useRef(new Map<string, HTMLElement>());
  const { fracture } = useFracture();

  async function dismiss(text: string, event: MouseEvent) {
    await fracture(refs.current.get(text) ?? null, { at: event });
    // Let the burst start, then collapse the empty slot so the cards reflow.
    setTimeout(() => setLeaving((current) => new Set(current).add(text)), 250);
  }

  function remove(text: string) {
    setNotes((current) => current.filter((note) => note.text !== text));
    setLeaving((current) => {
      const next = new Set(current);
      next.delete(text);
      return next;
    });
  }

  return (
    <div className="cards">
      {notes.map(({ text, description, icon, color }) => (
        <div
          key={text}
          className={`note-slot${leaving.has(text) ? " leaving" : ""}`}
          onTransitionEnd={(e) => {
            if (e.target === e.currentTarget && leaving.has(text)) remove(text);
          }}
        >
          <div className="note-clip">
            <article
              className="note"
              style={{ "--tone": color } as React.CSSProperties}
              ref={(node) => {
                if (node) refs.current.set(text, node);
                else refs.current.delete(text);
              }}
            >
              <span className="note-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">{icons[icon]}</svg>
              </span>
              <div className="note-copy">
                <h3>{text}</h3>
                <p>{description}</p>
              </div>
              <button
                className="secondary"
                aria-label={`Dismiss: ${text}`}
                onClick={(e) => dismiss(text, e)}
              >
                Dismiss
              </button>
            </article>
          </div>
        </div>
      ))}
      {!notes.length && (
        <button className="secondary" onClick={() => setNotes(initialNotes)}>
          Bring them back
        </button>
      )}
    </div>
  );
}

function Slab() {
  const slab = useRef<HTMLDivElement>(null);
  // Options give this component its own stage with its own physics.
  const { fracture, restore } = useFracture({
    motion: { gravity: 2400, timeScale: 0.2 },
    blur: false,
  });
  const [broken, setBroken] = useState(false);
  return (
    <div className="row">
      <div
        ref={slab}
        className="slab"
        onClick={async (event) => {
          if (broken) return;
          setBroken(true);
          await fracture(slab, {
            at: event,
            fracture: { radialCracks: 5, generations: 2 },
            impulse: { outwardSpeed: 250, towardCameraSpeedMax: 400 },
          });
        }}
      >
        Chunky, fast, no blur.
      </div>
      <button
        className="secondary"
        disabled={!broken}
        onClick={() => {
          restore();
          setBroken(false);
        }}
      >
        Restore
      </button>
    </div>
  );
}

function App() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section className="panel">
        <h2>Shatter a modal</h2>
        <p className="muted">
          A native <code>&lt;dialog&gt;</code> in the top layer. Delete breaks
          it where you clicked, then closes it.
        </p>
        <button onClick={() => setOpen(true)}>Open modal</button>
        {open && <Modal onClose={() => setOpen(false)} />}
      </section>
      <section className="panel">
        <h2>Dismiss with prejudice</h2>
        <Cards />
      </section>
      <section className="panel">
        <h2>Custom physics</h2>
        <Slab />
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
