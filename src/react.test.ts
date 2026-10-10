// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFracture, useFractureEasterEgg } from "./react";
import { createFractureStage, getFractureStage } from "./index";
import { installEasterEgg } from "./easter-egg";
import type { FractureResult, FractureStage } from "./types";

vi.mock("./index", () => ({
  createFractureStage: vi.fn(),
  getFractureStage: vi.fn(),
}));
vi.mock("./easter-egg", () => ({ installEasterEgg: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function fakeStage() {
  let idle!: () => void;
  const results: FractureResult[] = [];
  const stage = {
    fracture: vi.fn(async (element: Element) => {
      const result = {
        element,
        pieces: 3,
        settled: new Promise<void>(() => {}),
        restore: vi.fn(),
      };
      results.push(result);
      return result;
    }),
    strike: vi.fn(async () => true),
    idle: vi.fn(() => new Promise<void>((done) => (idle = done))),
    dispose: vi.fn(),
  };
  return {
    stage: stage as unknown as FractureStage & typeof stage,
    results,
    settle: () => idle(),
  };
}

it("fractures refs and elements on the shared stage and ignores empty refs", async () => {
  const { stage, results } = fakeStage();
  vi.mocked(getFractureStage).mockResolvedValue(stage);
  const { result, unmount } = renderHook(() => useFracture());
  const element = document.createElement("div");
  await expect(result.current.fracture({ current: null })).resolves.toBeNull();
  await result.current.fracture({ current: element }, { at: { x: 1, y: 2 } });
  await result.current.fracture(element);
  expect(stage.fracture).toHaveBeenCalledWith(element, { at: { x: 1, y: 2 } });
  expect(stage.fracture).toHaveBeenCalledTimes(2);
  result.current.restore();
  expect(
    results.every((r) => vi.mocked(r.restore).mock.calls.length === 1),
  ).toBe(true);
  unmount();
  expect(createFractureStage).not.toHaveBeenCalled();
  expect(stage.dispose).not.toHaveBeenCalled();
});

it("owns a stage when given options and disposes it after pieces settle", async () => {
  const { stage, settle } = fakeStage();
  vi.mocked(createFractureStage).mockResolvedValue(stage);
  const options = { blur: false as const };
  const { result, rerender, unmount } = renderHook(() => useFracture(options));
  const controls = result.current;
  rerender();
  expect(result.current).toBe(controls);
  await result.current.strike({ x: 5, y: 5 });
  await result.current.fracture(document.createElement("p"));
  expect(createFractureStage).toHaveBeenCalledOnce();
  expect(createFractureStage).toHaveBeenCalledWith(options);
  unmount();
  await vi.waitFor(() => expect(stage.idle).toHaveBeenCalled());
  expect(stage.dispose).not.toHaveBeenCalled();
  await act(async () => settle());
  expect(stage.dispose).toHaveBeenCalledOnce();
});

it("installs the easter egg only while enabled and uses the latest callbacks", () => {
  const uninstall = vi.fn();
  vi.mocked(installEasterEgg).mockReturnValue(uninstall);
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ enabled, onExit }) =>
      useFractureEasterEgg({ enabled, onExit, triggers: ["konami"] }),
    { initialProps: { enabled: false, onExit: first } },
  );
  expect(installEasterEgg).not.toHaveBeenCalled();
  rerender({ enabled: true, onExit: first });
  expect(installEasterEgg).toHaveBeenCalledOnce();
  expect(vi.mocked(installEasterEgg).mock.calls[0]?.[0]?.triggers).toEqual([
    "konami",
  ]);
  rerender({ enabled: true, onExit: second });
  expect(installEasterEgg).toHaveBeenCalledOnce();
  vi.mocked(installEasterEgg).mock.calls[0]?.[0]?.onExit?.();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  rerender({ enabled: false, onExit: second });
  expect(uninstall).toHaveBeenCalledOnce();
  unmount();
  expect(uninstall).toHaveBeenCalledOnce();
});
