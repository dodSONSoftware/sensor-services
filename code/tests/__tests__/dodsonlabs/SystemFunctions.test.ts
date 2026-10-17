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
  redactLogMessage,
  SENSITIVE_SECRET_KEYS,
  SECRET_MASK,
  MIN_SECRET_VALUE_LENGTH,
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

describe("redactLogMessage (central two-tier log redaction)", () => {
  it("masks double-quoted JSON key values and preserves the rest", () => {
    const input = '{"wifi-password": "sup3rsecretpw", "rssi": -42}';
    expect(redactLogMessage(input)).toBe('{"wifi-password": ********, "rssi": -42}');
  });

  it("masks single-quoted key values", () => {
    expect(redactLogMessage("{'db-password': 'hunter2x9'}")).toBe("{'db-password': ********}");
  });

  it("masks bare key: value and key=value forms", () => {
    expect(redactLogMessage("db-password: hunter2x9")).toBe("db-password: ********");
    // Bare values span URL characters up to the terminators (whitespace, , ; | } and quotes)
    expect(redactLogMessage("loki-url=http://loki.test:3100")).toBe("loki-url=********");
  });

  it("masks YAML block style across the newline", () => {
    expect(redactLogMessage("db-password:\n  topsecret99")).toBe("db-password:\n  ********");
  });

  it("matches key names case-insensitively", () => {
    expect(redactLogMessage('{"WiFi-Password": "v1234567"}')).toBe('{"WiFi-Password": ********}');
    expect(redactLogMessage("DB-PASSWORD=v1234567")).toBe("DB-PASSWORD=********");
  });

  it("masks a quoted value containing escaped quotes", () => {
    const input = '{"password": "quoted with \\"escaped\\" inside"}';
    expect(redactLogMessage(input)).toBe('{"password": ********}');
  });

  it("masks every SENSITIVE_SECRET_KEYS entry plus loki-url (drift guard)", () => {
    for (const key of [...SENSITIVE_SECRET_KEYS, "loki-url"]) {
      const out = redactLogMessage(`"${key}": "v1234567"`);
      expect(out).toContain(SECRET_MASK);
      expect(out).not.toContain("v1234567");
    }
  });

  it("masks the full hyphenated key, not a partial match", () => {
    const out = redactLogMessage('{"wifi-password": "abc12345"}');
    expect(out).toBe('{"wifi-password": ********}');
    expect(out).toContain("wifi-password");
    expect(out).not.toContain("wifi-********");
  });

  it("does not mask longer keys that end in a sensitive name", () => {
    expect(redactLogMessage("xpassword: abc12345")).toBe("xpassword: abc12345");
    expect(redactLogMessage("passwords: abc12345")).toBe("passwords: abc12345");
  });

  it("leaves key mentions without a value untouched", () => {
    expect(redactLogMessage('config key "password" missing')).toBe('config key "password" missing');
    expect(redactLogMessage("db-password is set")).toBe("db-password is set");
  });

  it("masks sensitive key values nested inside string values", () => {
    // Documented over-masking of embedded patterns — safer than not
    expect(redactLogMessage('{"note": "password: xyz12345"}')).toBe('{"note": "password": ********}');
  });

  it("value tier masks known secret values outside key-value form", () => {
    const out = redactLogMessage("connected with Sup3rDbSecretValue at 12:00", ["Sup3rDbSecretValue"]);
    expect(out).toBe("connected with ******** at 12:00");
  });

  it("value tier is literal — regex metacharacters in values are safe", () => {
    const value = "p@ss.123+*?@h";
    const out = redactLogMessage(`push to ${value} ok`, [value]);
    expect(out).toBe("push to ******** ok");
  });

  it("value tier applies longest-first so nested secrets do not mangle each other", () => {
    const out = redactLogMessage(
      "see http://user:pw@h:3100 end",
      ["http://user:pw@h:3100", "user:pw@h"]
    );
    expect(out).toBe("see ******** end");
  });

  it("skips empty and short values per the length guard", () => {
    expect(redactLogMessage("note: x", ["x"])).toBe("note: x");
    expect(redactLogMessage("hello", [""])).toBe("hello");
    expect(redactLogMessage("hello", [])).toBe("hello");
    // Boundary: MIN_SECRET_VALUE_LENGTH - 1 is skipped, MIN_SECRET_VALUE_LENGTH is masked
    const short = "a".repeat(MIN_SECRET_VALUE_LENGTH - 1);
    const exact = "b".repeat(MIN_SECRET_VALUE_LENGTH);
    expect(redactLogMessage(`v ${short} v`, [short])).toBe(`v ${short} v`);
    expect(redactLogMessage(`v ${exact} v`, [exact])).toBe("v ******** v");
  });

  it("is pure and idempotent", () => {
    const input = '{"db-password": "hunter2x9"} and Sup3rDbSecretValue';
    redactLogMessage(input, ["Sup3rDbSecretValue"]);
    expect(input).toBe('{"db-password": "hunter2x9"} and Sup3rDbSecretValue');
    const once = redactLogMessage(input, ["Sup3rDbSecretValue"]);
    expect(redactLogMessage(once, ["Sup3rDbSecretValue"])).toBe(once);
  });

  it("returns an empty message unchanged", () => {
    expect(redactLogMessage("")).toBe("");
  });

  it("uses the same mask as redactSecrets", () => {
    expect(SECRET_MASK).toBe("********");
    expect(redactLogMessage('{"password": "a1b2c3d4"}')).toBe('{"password": ********}');
    expect(redactSecrets({ password: "a1b2c3d4" }).password).toBe(SECRET_MASK);
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

  it("should preserve the existing file's permission mode when replacing it", () => {
    const target = path.join(tmpDir, "config.yml");
    fs.writeFileSync(target, "old: config\n");
    // Operator deliberately restricts a credentials-bearing config
    fs.chmodSync(target, 0o600);

    const ok = write_file_atomic(target, "new: config\n");

    expect(ok).toBe(true);
    expect(fs.readFileSync(target, "utf8")).toBe("new: config\n");
    // The restrictive mode must survive the atomic replacement — the
    // replacement inode otherwise gets the process's umask-based creation
    // mode (0644 under a common 0022 umask), silently widening access
    expect(fs.statSync(target).mode & 0o777).toBe(0o600);
  });

  it("should apply the existing mode exactly even when the umask would strip bits", () => {
    const target = path.join(tmpDir, "config.yml");
    fs.writeFileSync(target, "old: config\n");
    // 0640 grants group read; an open() mode of 0640 under a 0077 umask
    // would be masked to 0600 — only a chmod preserves the exact mode
    fs.chmodSync(target, 0o640);

    const previousUmask = process.umask();
    process.umask(0o077);
    let ok = false;
    try {
      ok = write_file_atomic(target, "new: config\n");
    } finally {
      process.umask(previousUmask); // never leak a changed umask to other tests
    }

    expect(ok).toBe(true);
    expect(fs.statSync(target).mode & 0o777).toBe(0o640);
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
