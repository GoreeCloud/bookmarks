import { describe, expect, it, vi } from "vitest";
import persistBeforeClose from "./persistBeforeClose";

describe("persistBeforeClose", () => {
  it("waits for confirmation before dismissing the editor", async () => {
    let resolveSave!: (value: string) => void;
    const persist = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSave = resolve;
        })
    );
    const close = vi.fn();
    const result = persistBeforeClose(
      { url: "https://example.com" },
      persist,
      close
    );

    expect(close).not.toHaveBeenCalled();
    resolveSave("saved");
    await expect(result).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("preserves the editor when saving rejects", async () => {
    const close = vi.fn();
    const persist = vi.fn().mockRejectedValue(new Error("network offline"));
    await expect(
      persistBeforeClose({ url: "https://example.com" }, persist, close)
    ).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});
