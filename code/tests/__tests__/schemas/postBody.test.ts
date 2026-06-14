/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { postBodySchema, validatePostBody } from "../../../src/schemas/postBody";

describe("postBodySchema", () => {
  describe("valid bodies", () => {
    it("should accept a normal object", () => {
      const result = postBodySchema.safeParse({ key: "value" });
      expect(result.success).toBe(true);
    });

    it("should accept an empty object", () => {
      const result = postBodySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept nested objects", () => {
      const result = postBodySchema.safeParse({ nested: { foo: "bar" } });
      expect(result.success).toBe(true);
    });

    it("should accept objects with arbitrary keys", () => {
      const result = postBodySchema.safeParse({ "write-config": { key: "value" } });
      expect(result.success).toBe(true);
    });

    it("should reject non-objects (array)", () => {
      const result = postBodySchema.safeParse([1, 2, 3]);
      expect(result.success).toBe(false);
    });

    it("should reject non-objects (string)", () => {
      const result = postBodySchema.safeParse("not an object");
      expect(result.success).toBe(false);
    });

    it("should reject non-objects (number)", () => {
      const result = postBodySchema.safeParse(42);
      expect(result.success).toBe(false);
    });
  });

  describe("prototype pollution prevention", () => {
    // Object.create(null) creates an object without Object.prototype,
    // so setting constructor/prototype creates own keys rather than modifying the prototype chain.
    // Note: Zod's .object({}) automatically strips __proto__, so we only test constructor/prototype.
    function makeWithOwnKey(key: string, value: unknown): Record<string, unknown> {
      const obj = Object.create(null) as Record<string, unknown>;
      obj[key] = value;
      return obj;
    }

    it("should reject constructor as an own key", () => {
      const result = postBodySchema.safeParse(makeWithOwnKey("constructor", { foo: "bar" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("request body contains disallowed keys");
      }
    });

    it("should reject prototype as an own key", () => {
      const result = postBodySchema.safeParse(makeWithOwnKey("prototype", "evil"));
      expect(result.success).toBe(false);
    });
  });
});

describe("validatePostBody", () => {
  it("should return parsed object for valid body", () => {
    const result = validatePostBody({ key: "value" });
    expect(result).toEqual({ key: "value" });
  });

  it("should return null for invalid body", () => {
    const result = validatePostBody("not an object");
    expect(result).toBeNull();
  });

  it("should return null for constructor pollution attempt", () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj["constructor"] = { polluted: true };
    const result = validatePostBody(obj);
    expect(result).toBeNull();
  });
});
