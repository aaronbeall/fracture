// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFracture } from "./react";
import { setupFracture } from "./index";

vi.mock("./index", () => ({ setupFracture: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function type(text: string, options: KeyboardEventInit = {}) {
  for (const key of text) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
}

it("does not install a listener or load the effect when disabled", () => {
  const listen = vi.spyOn(window, "addEventListener");
  renderHook(() => useFracture());
  expect(listen.mock.calls.some(([type]) => type === "keydown")).toBe(false);
  type("ya done messed up aaron!");
  expect(setupFracture).not.toHaveBeenCalled();
  listen.mockRestore();
});

it("ignores case, whitespace and punctuation but requires the final exclamation", async () => {
  vi.mocked(setupFracture).mockResolvedValue(vi.fn());
  renderHook(() => useFracture({ enabled: true }));
  type("YA done, messed up... A-A-RON");
  expect(setupFracture).not.toHaveBeenCalled();
  await act(async () => type("!"));
  expect(setupFracture).toHaveBeenCalledOnce();
});

it.each(["x", "é", "!"])("resets on an out-of-order %s", async (wrong) => {
  vi.mocked(setupFracture).mockResolvedValue(vi.fn());
  renderHook(() => useFracture({ enabled: true }));
  type(`ya done${wrong}messed up aaron!`);
  expect(setupFracture).not.toHaveBeenCalled();
  await act(async () => type("ya done messed up aaron!"));
  expect(setupFracture).toHaveBeenCalledOnce();
});

it("ignores shortcut modifiers, repeats and composition", async () => {
  vi.mocked(setupFracture).mockResolvedValue(vi.fn());
  renderHook(() => useFracture({ enabled: true }));
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { repeat: true },
    { isComposing: true },
  ]) {
    type("ya done messed up aaron!", options);
  }
  expect(setupFracture).not.toHaveBeenCalled();
  await act(async () => type("ya done messed up aaron!"));
  expect(setupFracture).toHaveBeenCalledOnce();
});

it("cleans up the session and resets partial progress when disabled or unmounted", async () => {
  const restore = vi.fn();
  vi.mocked(setupFracture).mockResolvedValue(restore);
  const { rerender, unmount } = renderHook(
    ({ enabled }) => useFracture({ enabled }),
    { initialProps: { enabled: true } },
  );
  type("ya done");
  rerender({ enabled: false });
  type("messed up aaron!");
  expect(setupFracture).not.toHaveBeenCalled();
  rerender({ enabled: true });
  type("messed up aaron!");
  expect(setupFracture).not.toHaveBeenCalled();
  await act(async () => type("ya done messed up aaron!"));
  const signal = vi.mocked(setupFracture).mock.calls[0]?.[0]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  expect(restore).toHaveBeenCalledOnce();
  type("ya done messed up aaron!");
  expect(setupFracture).toHaveBeenCalledOnce();
});

it("cancels pending loading without accepting duplicate activations", async () => {
  let resolve!: (cleanup: () => void) => void;
  vi.mocked(setupFracture).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { unmount } = renderHook(() => useFracture({ enabled: true }));
  type("ya done messed up aaron!ya done messed up aaron!");
  expect(setupFracture).toHaveBeenCalledOnce();
  const signal = vi.mocked(setupFracture).mock.calls[0]?.[0]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  const restore = vi.fn();
  await act(async () => resolve(restore));
  expect(restore).toHaveBeenCalledOnce();
});
