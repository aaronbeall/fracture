export async function setupFracture({
  signal,
}: { signal?: AbortSignal } = {}): Promise<() => void> {
  if (signal?.aborted || typeof document === "undefined") return () => {};
  const { setup } = await import("./runtime");
  if (signal?.aborted) return () => {};
  const dispose = setup();
  signal?.addEventListener("abort", dispose, { once: true });
  return () => {
    signal?.removeEventListener("abort", dispose);
    dispose();
  };
}

export { setupFracture as setup };
