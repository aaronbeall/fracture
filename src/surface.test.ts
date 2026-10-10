// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { findSurface, hideSurface, opaqueAt } from "./surface";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("painted surface detection", () => {
  it("never captures overlay instructions or HUD counters", () => {
    document.body.innerHTML =
      '<aside data-fracture-lens-overlay style="background:black"><output>Destroyed 10</output></aside>';
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 300, 60),
    );
    expect(findSurface(document.querySelector("output"))).toBeNull();
  });

  it("skips layout wrappers and selects a painted ancestor", () => {
    document.body.innerHTML =
      '<section style="background-color: blue"><div><span></span></div></section>';
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, 100),
    );
    const nativeStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
      nativeStyle(element),
    );
    expect(findSurface(document.querySelector("span"))).toBe(
      document.querySelector("section"),
    );
  });

  it("selects standalone text and borders without selecting an empty wrapper", () => {
    document.body.innerHTML =
      '<div id="empty"></div><span id="text">Visible text</span><div id="border" style="border:1px solid red"></div>';
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, 100),
    );
    const nativeStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
      nativeStyle(element),
    );
    expect(findSurface(document.getElementById("empty"))).toBeNull();
    expect(findSurface(document.getElementById("text"))).toBe(
      document.getElementById("text"),
    );
    expect(findSurface(document.getElementById("border"))).toBe(
      document.getElementById("border"),
    );
  });

  it("captures the owning SVG rather than a bare path and ignores already-hidden ancestors", () => {
    document.body.innerHTML = '<svg><path d="M0 0L20 20" /></svg>';
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 20, 20),
    );
    expect(findSurface(document.querySelector("path"))).toBe(
      document.querySelector("svg"),
    );
    const restore = hideSurface(document.body);
    expect(findSurface(document.querySelector("path"))).toBeNull();
    restore();
  });

  it("allows hits through transparent texels", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    const snapshot = {
      canvas,
      left: 0,
      top: 0,
      width: 20,
      height: 10,
      pixels: new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 255]),
    };
    expect(opaqueAt(snapshot, { x: 2, y: 5 })).toBe(false);
    expect(opaqueAt(snapshot, { x: 15, y: 5 })).toBe(true);
  });
});
