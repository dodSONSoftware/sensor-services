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
