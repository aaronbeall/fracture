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

const initialCards = [
  "Your build passed",
  "3 new comments on your PR",
  "Disk space is running low",
  "Meeting moved to 3pm",
];

function Cards() {
  const [cards, setCards] = useState(initialCards);
  const refs = useRef(new Map<string, HTMLElement>());
  const { fracture } = useFracture();

  async function dismiss(card: string, event: MouseEvent) {
    await fracture(refs.current.get(card) ?? null, { at: event });
    setCards((current) => current.filter((c) => c !== card));
  }

  return (
    <div className="cards">
      {cards.map((card) => (
        <div
          key={card}
          className="note"
          ref={(node) => {
            if (node) refs.current.set(card, node);
            else refs.current.delete(card);
          }}
        >
          <span>{card}</span>
          <button className="secondary" onClick={(e) => dismiss(card, e)}>
            Dismiss
          </button>
        </div>
      ))}
      {!cards.length && (
        <button className="secondary" onClick={() => setCards(initialCards)}>
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
        Chunky, fast, no blur. Click me.
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
