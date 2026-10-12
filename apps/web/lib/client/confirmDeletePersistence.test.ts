import { describe, expect, it, vi } from "vitest";
import confirmDeletePersistence from "./confirmDeletePersistence";

describe("confirmed bookmark deletion", () => {
  it("does not close or navigate before server confirmation", async () => {
    let resolve!: () => void;
    const request = new Promise<void>((done) => { resolve = done; });
    const onDeleted = vi.fn();
    const result = confirmDeletePersistence(() => request, onDeleted);
    expect(onDeleted).not.toHaveBeenCalled();
    resolve();
    await expect(result).resolves.toBe(true);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog and route intact when deletion fails", async () => {
    const onDeleted = vi.fn();
    await expect(confirmDeletePersistence(
      async () => { throw new Error("offline"); },
      onDeleted
    )).resolves.toBe(false);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
