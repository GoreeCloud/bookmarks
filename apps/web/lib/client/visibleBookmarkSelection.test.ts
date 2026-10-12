import { describe, expect, it } from "vitest";
import {
  selectableBookmarkIds,
  selectedVisibleBookmarkIds,
} from "./visibleBookmarkSelection";

describe("visible bookmark bulk selection", () => {
  it("never includes selections outside the current visible view", () => {
    expect(selectedVisibleBookmarkIds([3, 5], { 7: true, 3: true })).toEqual([
      3,
    ]);
  });

  it("does not confuse an equal count of unrelated selected links with select all", () => {
    const visible = [10, 11];
    const selected = { 20: true, 21: true } as Record<number, true>;
    expect(selectedVisibleBookmarkIds(visible, selected)).toEqual([]);
    expect(selectedVisibleBookmarkIds(visible, selected).length).not.toBe(
      visible.length
    );
  });

  it("deduplicates and omits invalid, optimistic, and empty IDs", () => {
    expect(
      selectableBookmarkIds([4, 4, 5, 0, -99, null, undefined, NaN, 2.4])
    ).toEqual([4, 5]);
  });

  it("supports partially selected visible views", () => {
    expect(
      selectedVisibleBookmarkIds([1, 2, 3], { 1: true, 3: true, 99: true })
    ).toEqual([1, 3]);
  });

  it("never returns hidden selections when a filtered view is empty", () => {
    expect(selectedVisibleBookmarkIds([], { 42: true })).toEqual([]);
  });
});
