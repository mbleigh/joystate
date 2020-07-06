import expect from "expect";

import { createStore, Store, set, get, loading, error } from "../src/index";

interface TestState {
  text: string;
}

describe("Store", () => {
  let store: Store<TestState>;
  beforeEach(() => {
    store = createStore({});
  });

  describe("#set", () => {
    it("should allow setting of a simple value", async () => {
      await set(store, "text", "value");
      expect(get(store, "text")).toEqual("value");
    });

    it("should allow setting of a promise", async () => {
      set(store, "text", Promise.resolve("value"));
      expect(loading(store, "text")).toBe(true);
      await Promise.resolve(); // TODO: better wait
      expect(get(store, "text")).toEqual("value");
      expect(loading(store, "text")).toBe(false);
    });

    it("should allow setting of a promise that errors", async () => {
      const err = new Error("expected error");
      set(store, "text", Promise.reject(err));
      await Promise.resolve(); // TODO: better wait
      expect(get(store, "text")).toBeUndefined();
      expect(error(store, "text")).toEqual(err);
    });
  });
});
