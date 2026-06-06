import {
  ensureError,
  formatElapsedTime,
  convert_from_log_level_string_to_enum,
  convert_enum_to_string,
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

  it("should default to LogLevel.None for unknown strings", () => {
    expect(convert_from_log_level_string_to_enum("unknown")).toBe(LogLevel.None);
  });
});

describe("convert_enum_to_string", () => {
  it("should convert LogLevel.Error to 'Error'", () => {
    expect(convert_enum_to_string(LogLevel.Error)).toBe("Error");
  });

  it("should convert LogLevel.Info to 'Info'", () => {
    expect(convert_enum_to_string(LogLevel.Info)).toBe("Info");
  });

  it("should convert LogLevel.Debug to 'Debug'", () => {
    expect(convert_enum_to_string(LogLevel.Debug)).toBe("Debug");
  });

  it("should convert LogLevel.None to 'None'", () => {
    expect(convert_enum_to_string(LogLevel.None)).toBe("None");
  });
});
