import { describe, it, expect } from "vitest";
import { chunkIds, ID_CHUNK } from "./shared";

describe("chunkIds", () => {
  it("пустой список → без пачек", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("меньше лимита → одна пачка целиком", () => {
    expect(chunkIds(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("ровно лимит → одна пачка, лимит+1 → две", () => {
    const exact = Array.from({ length: ID_CHUNK }, (_, i) => i);
    expect(chunkIds(exact)).toEqual([exact]);
    const over = [...exact, ID_CHUNK];
    const chunks = chunkIds(over);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toEqual([ID_CHUNK]);
  });

  it("ничего не теряет и сохраняет порядок", () => {
    const ids = Array.from({ length: ID_CHUNK * 2 + 7 }, (_, i) => `id-${i}`);
    expect(chunkIds(ids).flat()).toEqual(ids);
  });
});
