/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { aboutDude, createLogger, logger, reqId, setLogger, setReqIdStore } from "../../../src/common/global";

describe("aboutDude", () => {
  it("should return an IAbout object with expected structure", () => {
    const about = aboutDude();

    expect(about).toHaveProperty("about");
    expect(about.about).toHaveProperty("name");
    expect(about.about).toHaveProperty("version");
    expect(about.about).toHaveProperty("author");
    expect(about.about).toHaveProperty("copyright");
    expect(about.about).toHaveProperty("license");
    expect(about.about).toHaveProperty("description");
    expect(about).toHaveProperty("commands");
    expect(Array.isArray(about.commands)).toBe(true);
  });

  it("should return the same cached object on subsequent calls", () => {
    const first = aboutDude();
    const second = aboutDude();
    expect(first).toBe(second);
  });

  it("should have a non-empty name", () => {
    const about = aboutDude();
    expect(about.about.name).toBeTruthy();
  });

  it("should have a version string", () => {
    const about = aboutDude();
    expect(typeof about.about.version).toBe("string");
  });
});

// **** createLogger / setReqIdStore

describe("createLogger", () => {
  afterEach(() => {
    setLogger(undefined as any);
  });

  it("should create a Logger and set it via setLogger", () => {
    const config = {
      "log-level": "info",
      "express-port": 32000,
      "mqtt-broker-ip-address": "127.0.0.1",
      "mqtt-topic-command": "iot/v2/command",
      "mqtt-topic-command-response": "iot/v2/command-response",
      "ip-pinger-web-api": "http://127.0.0.1:3300",
      "case-sensitive": true,
    } as any;

    createLogger(config);

    const log = logger();
    expect(log).toBeDefined();
    expect(log).toHaveProperty("write_info");
    expect(log).toHaveProperty("write_error");
    expect(log).toHaveProperty("write_debug");
    expect(log).toHaveProperty("write_warn");
  });

  it("should create a Logger with debug level when config specifies debug", () => {
    const config = {
      "log-level": "debug",
      "express-port": 32000,
      "mqtt-broker-ip-address": "127.0.0.1",
      "mqtt-topic-command": "iot/v2/command",
      "mqtt-topic-command-response": "iot/v2/command-response",
      "ip-pinger-web-api": "http://127.0.0.1:3300",
      "case-sensitive": true,
    } as any;

    createLogger(config);

    const log = logger();
    expect(log).toBeDefined();
  });
});

describe("setReqIdStore", () => {
  it("is a no-op — the middleware manages the store via AsyncLocalStorage.run()", () => {
    // setReqIdStore no longer directly sets the store; the middleware
    // in middleware.ts wraps next() in _reqIdStore.run(id, next) so
    // each request gets its own isolated async context.
    setReqIdStore("ignored");
    expect(reqId()).toBe("none");
  });
});
