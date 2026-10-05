/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ensureError,
  formatElapsedTime,
  convert_from_log_level_string_to_enum,
  write_file_atomic,
  redactSecrets,
  SENSITIVE_SECRET_KEYS,
} from "../../../src/dodsonlabs/SystemFunctions";
import { LogLevel } from "../../../src/dodsonlabs/Interfaces";

describe("ensureError", () => {
  it("should return the error if value is already an Error", () => {
    const err = new Error("test");
    expect(ensureError(err)).toBe(err);
  });

  it("should return a default error if value is undefined", () => {
    const err = ensureError(undefined);
    expect(err.message).toBe("<<< Error is undefined >>>");
  });

  it("should stringify non-Error values", () => {
    const err = ensureError({ code: 500 });
    expect(err.message).toBe('{"code":500}');
  });

  it("should handle values that cannot be JSON stringified", () => {
    const circular: any = { a: 1 };
    circular.b = circular;
    const err = ensureError(circular);
    expect(err.message).toBe(
      "Unknown Error: error value cannot be converted to a json string."
    );
  });
});

describe("redactSecrets (P1-3 shared redaction)", () => {
  it("masks the minimum required secret keys at the top level", () => {
    const input = {
      "wifi-password": "a",
      "password": "b",
      "db-password": "c",
      source: "keep",
    };
    const out = redactSecrets(input);
    expect(out["wifi-password"]).toBe("********");
    expect(out["password"]).toBe("********");
    expect(out["db-password"]).toBe("********");
    expect(out["source"]).toBe("keep");
  });

  it("redacts recursively through nested objects and arrays", () => {
    const input = {
      config: {
        "wifi-password": "x",
        nested: { "db-password": "y" },
        list: [{ password: "z" }, { ok: "v" }],
      },
    };
    const out = redactSecrets(input);
    expect(out.config["wifi-password"]).toBe("********");
    expect(out.config.nested["db-password"]).toBe("********");
    expect(out.config.list[0].password).toBe("********");
    expect(out.config.list[1].ok).toBe("v");
  });

  it("matches secret key names case-insensitively", () => {
    const out = redactSecrets({ "WiFi-Password": "s", "DB-PASSWORD": "s2" });
    expect(out["WiFi-Password"]).toBe("********");
    expect(out["DB-PASSWORD"]).toBe("********");
  });

  it("does not mutate the input", () => {
    const input = { "wifi-password": "orig", "password": "orig" };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactSecrets(input);
    expect(input).toEqual(snapshot);
  });

  it("returns primitives and null unchanged", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets(undefined)).toBe(undefined);
  });

  it("honors a custom key set", () => {
    const out = redactSecrets({ api_token: "t", "wifi-password": "w" }, new Set(["api_token"]));
    expect(out.api_token).toBe("********");
    expect(out["wifi-password"]).toBe("w");
  });

  it("exposes the minimum required keys in SENSITIVE_SECRET_KEYS", () => {
    expect(SENSITIVE_SECRET_KEYS.has("wifi-password")).toBe(true);
    expect(SENSITIVE_SECRET_KEYS.has("password")).toBe(true);
    expect(SENSITIVE_SECRET_KEYS.has("db-password")).toBe(true);
  });
});

describe("formatElapsedTime", () => {
  it("should format 0ms as 00:00:00.000", () => {
    expect(formatElapsedTime(0)).toBe("00:00:00.000");
  });

  it("should format 999ms as 00:00:00.999", () => {
    expect(formatElapsedTime(999)).toBe("00:00:00.999");
  });

  it("should format 1234567ms correctly", () => {
    expect(formatElapsedTime(1234567)).toBe("00:20:34.567");
  });

  it("should format hours correctly", () => {
    expect(formatElapsedTime(3661000)).toBe("01:01:01.000");
  });

  it("should format large values correctly", () => {
    expect(formatElapsedTime(90061000)).toBe("25:01:01.000");
  });
});

describe("write_file_atomic", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "write-atomic-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should replace the live file with the complete new content and leave no temp file behind", () => {
    const target = path.join(tmpDir, "config.yml");
    fs.writeFileSync(target, "old: config\n");

    const ok = write_file_atomic(target, "new: complete\nconfig\n");

    expect(ok).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("new: complete\nconfig\n");
    // No temporary files remain in the directory
    expect(fs.readdirSync(tmpDir)).toEqual(["config.yml"]);
  });

  it("should fail cleanly without touching the live file when the temp write cannot succeed", () => {
    // A path inside a nonexistent directory: the temp write fails before any
    // rename can happen
    const target = path.join(tmpDir, "does-not-exist", "config.yml");

    const ok = write_file_atomic(target, "new content");

    expect(ok).toBe(false);
    // Nothing was created anywhere under the temp dir
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it("should preserve the live file and clean up the temp file when the rename fails", () => {
    // A directory with the target name makes the rename fail (ENOTDIR/EISDIR)
    const target = path.join(tmpDir, "config.yml");
    fs.mkdirSync(target);

    const ok = write_file_atomic(target, "new content");

    expect(ok).toBe(false);
    // The original live path is untouched
    expect(fs.statSync(target).isDirectory()).toBe(true);
    // The temporary file was cleaned up
    expect(fs.readdirSync(tmpDir)).toEqual(["config.yml"]);
  });
});

describe("convert_from_log_level_string_to_enum", () => {
  it("should convert 'error' to LogLevel.Error", () => {
    expect(convert_from_log_level_string_to_enum("error")).toBe(LogLevel.Error);
  });

  it("should convert 'info' to LogLevel.Info", () => {
    expect(convert_from_log_level_string_to_enum("info")).toBe(LogLevel.Info);
  });

  it("should convert 'debug' to LogLevel.Debug", () => {
    expect(convert_from_log_level_string_to_enum("debug")).toBe(LogLevel.Debug);
  });

  it("should be case-insensitive", () => {
    expect(convert_from_log_level_string_to_enum("ERROR")).toBe(LogLevel.Error);
    expect(convert_from_log_level_string_to_enum("Debug")).toBe(LogLevel.Debug);
  });

  it("should default to LogLevel.Info for unknown strings", () => {
    expect(convert_from_log_level_string_to_enum("unknown")).toBe(LogLevel.Info);
  });
});
