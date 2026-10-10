// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installEasterEgg, KONAMI_CODE, type Trigger } from "./easter-egg";
import { activate } from "./everything";

vi.mock("./everything", () => ({ activate: vi.fn() }));
let uninstall: (() => void) | undefined;
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.resetAllMocks();
});

function press(key: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
}
function type(text: string, options: KeyboardEventInit = {}) {
  for (const key of text)
    expect(press(key, options).defaultPrevented).toBe(false);
}
const settle = () => vi.waitFor(() => Promise.resolve());
const arm = (...triggers: Trigger[]) => {
  vi.mocked(activate).mockReturnValue(vi.fn());
  uninstall = installEasterEgg({ triggers });
};
const aaron: Trigger = { sequence: "ya done messed up aaron!" };

describe("typed phrase trigger", () => {
  it("ignores case, whitespace and punctuation but requires symbols in the phrase", async () => {
    arm(aaron);
    type("YA done, messed up... A-A-RON");
    await settle();
    expect(activate).not.toHaveBeenCalled();
    type("!");
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });

  it.each(["x", "é", "!"])("resets on an out-of-order %s", async (wrong) => {
    arm(aaron);
    type(`ya done${wrong}messed up aaron!`);
    await settle();
    expect(activate).not.toHaveBeenCalled();
    type("ya done messed up aaron!");
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });

  it("ignores shortcut modifiers, repeats and composition", async () => {
    arm(aaron);
    for (const options of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { repeat: true },
      { isComposing: true },
    ])
      type("ya done messed up aaron!", options);
    await settle();
    expect(activate).not.toHaveBeenCalled();
    type("ya done messed up aaron!");
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });
});

describe("other triggers", () => {
  it("defaults to the Konami code", async () => {
    vi.mocked(activate).mockReturnValue(vi.fn());
    uninstall = installEasterEgg();
    for (const key of KONAMI_CODE.slice(0, -1)) press(key);
    press("Shift");
    press("A", { shiftKey: true });
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });

  it("matches an exact keyboard shortcut and claims it", async () => {
    arm({ keys: "ctrl+shift+f" });
    expect(press("F", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(
      press("F", { ctrlKey: true, shiftKey: true, altKey: true })
        .defaultPrevented,
    ).toBe(false);
    await settle();
    expect(activate).not.toHaveBeenCalled();
    expect(
      press("F", { ctrlKey: true, shiftKey: true, code: "KeyF" })
        .defaultPrevented,
    ).toBe(true);
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });

  it("counts rapid clicks inside a target", async () => {
    document.body.innerHTML = '<a id="logo"><img></a><p id="other"></p>';
    arm({ clicks: 3, target: "#logo" });
    const click = (selector: string) =>
      document
        .querySelector(selector)!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    click("#logo img");
    click("#other");
    click("#logo");
    await settle();
    expect(activate).not.toHaveBeenCalled();
    click("#logo");
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
  });

  it("supports custom triggers and cleans them up", async () => {
    const cleanup = vi.fn();
    let fire!: () => void;
    arm((activate) => {
      fire = activate;
      return cleanup;
    });
    fire();
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
    uninstall?.();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe("lifecycle", () => {
  it("passes options through and ends the session on uninstall", async () => {
    const dispose = vi.fn();
    vi.mocked(activate).mockReturnValue(dispose);
    const onExit = vi.fn();
    uninstall = installEasterEgg({
      triggers: [aaron],
      hud: false,
      onExit,
    });
    type("ya done messed up aaron!");
    await vi.waitFor(() => expect(activate).toHaveBeenCalledOnce());
    expect(activate).toHaveBeenCalledWith({ hud: false, onExit });
    await settle();
    uninstall();
    expect(dispose).toHaveBeenCalledOnce();
    type("ya done messed up aaron!");
    await settle();
    expect(activate).toHaveBeenCalledOnce();
  });

  it("does not activate after an abort that lands during loading", async () => {
    const controller = new AbortController();
    vi.mocked(activate).mockReturnValue(vi.fn());
    uninstall = installEasterEgg({
      triggers: [aaron],
      signal: controller.signal,
    });
    type("ya done messed up aaron!");
    controller.abort();
    await settle();
    expect(activate).not.toHaveBeenCalled();
    type("ya done messed up aaron!");
    await settle();
    expect(activate).not.toHaveBeenCalled();
  });
});
