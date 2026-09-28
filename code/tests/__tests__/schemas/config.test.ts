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
    "mqtt-topic-telemetry": "iot/v3/telemetry",
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

  it("should strip removed V2 info-request/info-response topic keys", () => {
    const config = {
      ...baseConfig,
      "mqtt-topic-info-request": "iot/v2/info-request",
      "mqtt-topic-info-response": "iot/v2/info-response",
    };
    const result = validateConfig(config);
    expect(result["mqtt-topic-info-request"]).toBeUndefined();
    expect(result["mqtt-topic-info-response"]).toBeUndefined();
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
