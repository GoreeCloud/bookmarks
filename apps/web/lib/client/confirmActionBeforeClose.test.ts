import { describe, expect, it, vi } from "vitest";
import confirmActionBeforeClose from "./confirmActionBeforeClose";

describe("confirmation actions", () => {
  it("waits for the action to complete before closing", async () => {
    let resolve!: () => void;
    const work = new Promise<void>((done) => { resolve = done; });
    const close = vi.fn();
    const outcome = confirmActionBeforeClose(() => work, close);
    expect(close).not.toHaveBeenCalled();
    resolve();
    await expect(outcome).resolves.toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the modal open if the action fails", async () => {
    const close = vi.fn();
    await expect(confirmActionBeforeClose(
      async () => { throw new Error("offline"); }, close
    )).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  it("supports synchronous successful confirmations", async () => {
    const close = vi.fn();
    await expect(confirmActionBeforeClose(() => undefined, close)).resolves.toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });
});
