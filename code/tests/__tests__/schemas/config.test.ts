/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { resolveIppingerFetchTimeoutMs, validateConfig } from "../../../src/schemas/config";

describe("configSchema", () => {
  const baseConfig = {
    "log-level": "info" as const,
    "express-port": 32000,
    "mqtt-broker-ip-address": "127.0.0.1",
    "mqtt-topic-command": "iot/v3/command",
    "mqtt-topic-command-response": "iot/v3/command-response",
    "ip-pinger-web-api": "http://127.0.0.1:3300",
    "case-sensitive": true,
    "db-host": "localhost",
    "db-port": 5432,
    "db-name": "sensor_web_services",
    "db-user": "sensor_user",
    "db-password": "secret",
  };

  it("should accept config without fetch-timeout-ms (optional)", () => {
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect(result["fetch-timeout-ms"]).toBeUndefined();
  });

  it("should reject a config missing a required key (Optional-5)", () => {
    // The companion exitCodes integration test proves the same omission makes
    // the compiled process exit 1 at startup; this pins the schema-level check.
    const { "db-password": _password, ...withoutPassword } = baseConfig;
    expect(() => validateConfig(withoutPassword)).toThrow();
  });

  it("should reject a typo'd key instead of silently stripping it (strict)", () => {
    // Regression: "forward-sensor-log" (typo of forward-sensor-logs) used to
    // be stripped during parsing, leaving the app on the default value.
    const config = { ...baseConfig, "forward-sensor-log": true };
    expect(() => validateConfig(config)).toThrow(/Unrecognized key/);
  });

  it("should reject removed V2 info-request/info-response topic keys (strict)", () => {
    const config = {
      ...baseConfig,
      "mqtt-topic-info-request": "iot/v2/info-request",
      "mqtt-topic-info-response": "iot/v2/info-response",
    };
    expect(() => validateConfig(config)).toThrow(/Unrecognized key/);
  });

  it("should accept config without mqtt-topic-telemetry (telemetry moved to sensor-telemetry-service)", () => {
    // Sensor telemetry/Prometheus publishing is owned by the
    // sensor-telemetry-service; this app has no consumer for the topic, so
    // the key must not be required for startup.
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect("mqtt-topic-telemetry" in result).toBe(false);
  });

  it("should reject the removed mqtt-topic-telemetry key (strict)", () => {
    // A deployment config still carrying the key fails startup loudly
    // instead of being silently ignored.
    const config = { ...baseConfig, "mqtt-topic-telemetry": "iot/v3/telemetry" };
    expect(() => validateConfig(config)).toThrow(/Unrecognized key/);
  });

  it("should report every unrecognized key in the error", () => {
    const config = { ...baseConfig, "bogus-one": 1, "bogus-two": "x" };
    expect(() => validateConfig(config)).toThrow(/"bogus-one"/);
    expect(() => validateConfig(config)).toThrow(/"bogus-two"/);
  });

  it("should accept config without mqtt-topic-log (optional)", () => {
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect(result["mqtt-topic-log"]).toBeUndefined();
  });

  it("should accept config with mqtt-topic-log", () => {
    const config = { ...baseConfig, "mqtt-topic-log": "iot/v3/log" };
    const result = validateConfig(config);
    expect(result["mqtt-topic-log"]).toBe("iot/v3/log");
  });

  it("should accept config with fetch-timeout-ms", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": 10_000 };
    const result = validateConfig(config);
    expect(result["fetch-timeout-ms"]).toBe(10_000);
  });

  it("should accept fetch-timeout-ms of 1", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": 1 };
    const result = validateConfig(config);
    expect(result["fetch-timeout-ms"]).toBe(1);
  });

  it("should reject fetch-timeout-ms of 0", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": 0 };
    expect(() => validateConfig(config)).toThrow("fetch-timeout-ms must be greater than 0");
  });

  it("should reject negative fetch-timeout-ms", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": -100 };
    expect(() => validateConfig(config)).toThrow("fetch-timeout-ms must be greater than 0");
  });

  it("should reject non-integer fetch-timeout-ms", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": 10.5 };
    expect(() => validateConfig(config)).toThrow("fetch-timeout-ms must be an integer");
  });

  it("should reject string fetch-timeout-ms", () => {
    const config = { ...baseConfig, "fetch-timeout-ms": "10000" };
    expect(() => validateConfig(config)).toThrow("fetch-timeout-ms must be a number");
  });

  // Optional-2: the key was renamed fetch-timeout-ms -> ippinger-fetch-timeout-ms
  // (its scope is only the pinger proxy/analyze fetches). The old key remains a
  // deprecated alias so existing deployment configs keep validating.
  it("should accept config with ippinger-fetch-timeout-ms", () => {
    const config = { ...baseConfig, "ippinger-fetch-timeout-ms": 8000 };
    const result = validateConfig(config);
    expect(result["ippinger-fetch-timeout-ms"]).toBe(8000);
  });

  it("should accept the old and new fetch-timeout keys together", () => {
    const config = { ...baseConfig, "ippinger-fetch-timeout-ms": 8000, "fetch-timeout-ms": 10_000 };
    const result = validateConfig(config);
    expect(result["ippinger-fetch-timeout-ms"]).toBe(8000);
    expect(result["fetch-timeout-ms"]).toBe(10_000);
  });

  it("should reject ippinger-fetch-timeout-ms of 0", () => {
    const config = { ...baseConfig, "ippinger-fetch-timeout-ms": 0 };
    expect(() => validateConfig(config)).toThrow("ippinger-fetch-timeout-ms must be greater than 0");
  });

  it("should reject non-integer ippinger-fetch-timeout-ms", () => {
    const config = { ...baseConfig, "ippinger-fetch-timeout-ms": 10.5 };
    expect(() => validateConfig(config)).toThrow("ippinger-fetch-timeout-ms must be an integer");
  });

  it("should accept config without command-silence-timeout-ms (optional)", () => {
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect(result["command-silence-timeout-ms"]).toBeUndefined();
  });

  it("should accept config with command-silence-timeout-ms", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 5000 };
    const result = validateConfig(config);
    expect(result["command-silence-timeout-ms"]).toBe(5000);
  });

  it("should accept command-silence-timeout-ms of 1", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 1 };
    const result = validateConfig(config);
    expect(result["command-silence-timeout-ms"]).toBe(1);
  });

  // P2-2: the HTTP command layer has a hard 10s cap, so a silence timeout above
  // 10000ms can never be honored. Validation must reject it at startup instead
  // of silently accepting an ineffective value.
  it("should accept command-silence-timeout-ms just below the cap (9999)", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 9_999 };
    const result = validateConfig(config);
    expect(result["command-silence-timeout-ms"]).toBe(9_999);
  });

  it("should accept command-silence-timeout-ms at the cap boundary (10000)", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 10_000 };
    const result = validateConfig(config);
    expect(result["command-silence-timeout-ms"]).toBe(10_000);
  });

  it("should reject command-silence-timeout-ms just above the cap (10001)", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 10_001 };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must not exceed 10000");
  });

  it("should reject command-silence-timeout-ms far above the cap (15000)", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 15_000 };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must not exceed 10000");
  });

  it("should reject command-silence-timeout-ms of 0", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 0 };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must be greater than 0");
  });

  it("should reject negative command-silence-timeout-ms", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": -100 };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must be greater than 0");
  });

  it("should reject non-integer command-silence-timeout-ms", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": 10.5 };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must be an integer");
  });

  it("should reject string command-silence-timeout-ms", () => {
    const config = { ...baseConfig, "command-silence-timeout-ms": "5000" };
    expect(() => validateConfig(config)).toThrow("command-silence-timeout-ms must be a number");
  });

  // ---- express-port (valid TCP port range)

  it("should accept express-port at the boundary (65535)", () => {
    const config = { ...baseConfig, "express-port": 65_535 };
    const result = validateConfig(config);
    expect(result["express-port"]).toBe(65_535);
  });

  it("should reject express-port above the TCP port range (65536)", () => {
    // A port above 65535 passes old-style "positive integer" validation but
    // makes Node's app.listen() fail at startup. The schema must reject it.
    const config = { ...baseConfig, "express-port": 65_536 };
    expect(() => validateConfig(config)).toThrow("express-port must be a valid TCP port (1-65535)");
  });

  // ---- express-body-limit (body-parser byte-size syntax)

  it("should accept a well-formed express-body-limit (1mb)", () => {
    const config = { ...baseConfig, "express-body-limit": "1mb" };
    const result = validateConfig(config);
    expect(result["express-body-limit"]).toBe("1mb");
  });

  it("should accept a bare byte-count express-body-limit (1048576)", () => {
    const config = { ...baseConfig, "express-body-limit": "1048576" };
    const result = validateConfig(config);
    expect(result["express-body-limit"]).toBe("1048576");
  });

  it("should accept decimal and kb/gb variants of express-body-limit", () => {
    for (const value of ["1.5mb", "10kb", "1gb"]) {
      const result = validateConfig({ ...baseConfig, "express-body-limit": value });
      expect(result["express-body-limit"]).toBe(value);
    }
  });

  it("should reject an unparseable express-body-limit (garbage)", () => {
    // body-parser parses the limit with `bytes` at express.json() construction;
    // an invalid value throws a TypeError while the app is assembled.
    const config = { ...baseConfig, "express-body-limit": "garbage" };
    expect(() => validateConfig(config)).toThrow("express-body-limit must be a byte size");
  });

  it("should reject an empty express-body-limit", () => {
    const config = { ...baseConfig, "express-body-limit": "" };
    expect(() => validateConfig(config)).toThrow("express-body-limit must be a byte size");
  });

  it("should reject a truncated express-body-limit (1foo)", () => {
    const config = { ...baseConfig, "express-body-limit": "1foo" };
    expect(() => validateConfig(config)).toThrow("express-body-limit must be a byte size");
  });

  it("should reject a negative express-body-limit", () => {
    const config = { ...baseConfig, "express-body-limit": "-1" };
    expect(() => validateConfig(config)).toThrow("express-body-limit must be a byte size");
  });

  it("should reject an exponent-form express-body-limit (1e5)", () => {
    const config = { ...baseConfig, "express-body-limit": "1e5" };
    expect(() => validateConfig(config)).toThrow("express-body-limit must be a byte size");
  });

  it("should reject a non-string express-body-limit", () => {
    const config = { ...baseConfig, "express-body-limit": 1_048_576 };
    expect(() => validateConfig(config)).toThrow(/expected string, received number/);
  });

  // ---- cors-allowed-origins (P3-5)

  it("should accept config without cors-allowed-origins (optional)", () => {
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect(result["cors-allowed-origins"]).toBeUndefined();
  });

  it("should accept well-formed http(s) origins", () => {
    const config = {
      ...baseConfig,
      "cors-allowed-origins": ["http://10.10.10.7:4200", "https://sensors.example.com"],
    };
    const result = validateConfig(config);
    expect(result["cors-allowed-origins"]).toEqual([
      "http://10.10.10.7:4200",
      "https://sensors.example.com",
    ]);
  });

  it("should accept an empty cors-allowed-origins list (deny all cross-origin)", () => {
    const config = { ...baseConfig, "cors-allowed-origins": [] };
    const result = validateConfig(config);
    expect(result["cors-allowed-origins"]).toEqual([]);
  });

  it("should reject an origin with a path", () => {
    const config = { ...baseConfig, "cors-allowed-origins": ["http://10.10.10.7:4200/ui"] };
    expect(() => validateConfig(config)).toThrow(/cors-allowed-origins/);
  });

  it("should reject an origin with embedded credentials", () => {
    const config = { ...baseConfig, "cors-allowed-origins": ["http://user:pass@10.10.10.7:4200"] };
    expect(() => validateConfig(config)).toThrow(/cors-allowed-origins/);
  });

  it("should reject a non-http(s) scheme", () => {
    const config = { ...baseConfig, "cors-allowed-origins": ["ftp://10.10.10.7"] };
    expect(() => validateConfig(config)).toThrow(/cors-allowed-origins/);
  });

  it("should reject a bare hostname (no scheme)", () => {
    const config = { ...baseConfig, "cors-allowed-origins": ["10.10.10.7:4200"] };
    expect(() => validateConfig(config)).toThrow(/cors-allowed-origins/);
  });

  it("should reject a non-array cors-allowed-origins", () => {
    const config = { ...baseConfig, "cors-allowed-origins": "http://10.10.10.7:4200" };
    expect(() => validateConfig(config)).toThrow();
  });

  it("should reject a non-string entry in cors-allowed-origins", () => {
    const config = { ...baseConfig, "cors-allowed-origins": [4200] };
    expect(() => validateConfig(config)).toThrow();
  });
});

describe("resolveIppingerFetchTimeoutMs (Optional-2 key rename precedence)", () => {
  const baseConfig = {
    "log-level": "info" as const,
    "express-port": 32000,
    "mqtt-broker-ip-address": "127.0.0.1",
    "mqtt-topic-command": "iot/v3/command",
    "mqtt-topic-command-response": "iot/v3/command-response",
    "ip-pinger-web-api": "http://127.0.0.1:3300",
    "case-sensitive": true,
    "db-host": "localhost",
    "db-port": 5432,
    "db-name": "sensor_web_services",
    "db-user": "sensor_user",
    "db-password": "secret",
  };

  it("falls back to the 10-second default when neither key is set", () => {
    expect(resolveIppingerFetchTimeoutMs(validateConfig(baseConfig))).toBe(10_000);
  });

  it("honors the new key (ippinger-fetch-timeout-ms)", () => {
    const config = validateConfig({ ...baseConfig, "ippinger-fetch-timeout-ms": 8000 });
    expect(resolveIppingerFetchTimeoutMs(config)).toBe(8000);
  });

  it("honors the deprecated old key (fetch-timeout-ms) when the new key is absent", () => {
    const config = validateConfig({ ...baseConfig, "fetch-timeout-ms": 12_000 });
    expect(resolveIppingerFetchTimeoutMs(config)).toBe(12_000);
  });

  it("prefers the new key over the old key when both are set", () => {
    const config = validateConfig({
      ...baseConfig,
      "ippinger-fetch-timeout-ms": 8000,
      "fetch-timeout-ms": 12_000,
    });
    expect(resolveIppingerFetchTimeoutMs(config)).toBe(8000);
  });
});
