/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { validateConfig } from "../../../src/schemas/config";

describe("configSchema", () => {
  const baseConfig = {
    "log-level": "info" as const,
    "express-port": 32000,
    "prometheus-port": 3301,
    "mqtt-broker-ip-address": "127.0.0.1",
    "mqtt-topic-telemetry": "iot/telemetry",
    "mqtt-topic-command": "iot/v2/command",
    "mqtt-topic-command-response": "iot/v2/command-response",
    "ip-pinger-web-api": "http://127.0.0.1:3300",
    "case-sensitive": true,
  };

  it("should accept config without fetch-timeout-ms (optional)", () => {
    const result = validateConfig(baseConfig);
    expect(result).toBeDefined();
    expect(result["fetch-timeout-ms"]).toBeUndefined();
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
});
