/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import * as net from "net";
import cors from "cors";
import express from "express";
import { Pool } from "pg";
import request from "supertest";
import LokiTransport from "winston-loki";

import { MqttCommandControl } from "../../../src/dodsonlabs/MqttCommandControl";
import { resolveIppingerFetchTimeoutMs, validateConfig } from "../../../src/schemas/config";

/**
 * Configuration-boundary regression group (P2-1).
 *
 * config.test.ts pins the Zod side of the contract — what validateConfig
 * accepts and rejects. This group pins the other side: each runtime-sensitive
 * key, at values Zod accepts, is handed to the exact downstream component
 * that src/ consumes it with, and asserted consumable:
 *
 *   express-port                 -> node net port validation (what app.listen runs, index.ts)
 *   db-port                      -> pg Pool constructor (settingsStore)
 *   express-body-limit           -> express.json({ limit }) (body-parser parses at construction, middleware)
 *   cors-allowed-origins         -> cors({ origin }) applied per request (middleware)
 *   ippinger-fetch-timeout-ms    -> AbortSignal.timeout() (pingerController, generalController)
 *   command-silence-timeout-ms   -> MqttCommandControl's silence timer
 *   ip-pinger-web-api /
 *   sensor-telemetry-api         -> template-literal URL building at the call sites
 *   swagger-server-url           -> OpenAPI servers[].url (used verbatim, swagger.ts)
 *   loki-url                     -> winston-loki host option (dodsonlabs/Logger)
 *
 * The group is deliberately small — it is not test volume. It guarantees the
 * invariant that a config declared valid by Zod can actually be consumed by
 * its downstream component: a future schema loosening that accepts a
 * runtime-unusable value (or a dependency upgrade that stops accepting what
 * we pass) fails here at the boundary instead of surfacing as a startup
 * crash or a silent runtime degradation.
 */
describe("config boundary: Zod-accepted values are consumable by their downstream components (P2-1)", () => {
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

  const withConfig = (overrides: Record<string, unknown>) => validateConfig({ ...baseConfig, ...overrides });

  // ---- express-port -> node net (app.listen, index.ts)

  describe("express-port -> node net port validation (the same validatePort app.listen runs)", () => {
    it.each([8080, 32000, 65535])("accepts a Zod-validated port %i without a synchronous RangeError", (port) => {
      const config = withConfig({ "express-port": port });
      // socket.connect() runs node's validatePort() — the same check
      // app.listen() performs — before any I/O. The error listener plus
      // immediate destroy keep the probe network-free: no port is bound,
      // and a refused local connect is swallowed.
      const socket = new net.Socket();
      socket.on("error", () => { /* ECONNREFUSED etc. — irrelevant to the probe */ });
      expect(() => socket.connect(config["express-port"], "127.0.0.1")).not.toThrow();
      socket.destroy();
    });

    it("probe sanity: node net really does reject a port outside the TCP range", () => {
      // Guards the probe itself: if node ever stops validating the port
      // synchronously here, the tests above would pass vacuously.
      const socket = new net.Socket();
      socket.on("error", () => { /* irrelevant */ });
      let thrown: unknown;
      try {
        socket.connect(65_536, "127.0.0.1");
      } catch (err) {
        thrown = err;
      } finally {
        socket.destroy();
      }
      // Node throws this from C++ internals, so the error's constructor is
      // node-context's RangeError, not the test context's — match on name and
      // message instead of instanceof.
      expect((thrown as { name?: string }).name).toBe("RangeError");
      expect((thrown as Error).message).toMatch(/Port should be >= 0 and < 65536/);
    });
  });

  // ---- db-port -> pg (settingsStore)

  describe("db-port -> pg Pool constructor (settingsStore builds pools with the config port verbatim)", () => {
    it.each([1, 5432, 65535])("pg accepts a Zod-validated port %i", async (port) => {
      const config = withConfig({ "db-port": port });
      const pool = new Pool({
        host: "127.0.0.1",
        port: config["db-port"],
        user: "boundary",
        password: "boundary",
        database: "boundary",
      });
      // Construction is the acceptance point; no connection is attempted —
      // end() on an idle pool resolves immediately.
      await expect(pool.end()).resolves.toBeUndefined();
    });
  });

  // ---- express-body-limit -> body-parser (middleware.ts)

  describe("express-body-limit -> express.json({ limit }) (body-parser parses the limit at construction)", () => {
    it.each(["0", "1048576", "1b", "1kb", "1.5mb", "1gb"])(
      "body-parser accepts a Zod-validated limit %s at construction",
      (limit) => {
        const config = withConfig({ "express-body-limit": limit });
        // An invalid limit throws a TypeError while the middleware is being
        // assembled — a startup failure. Every Zod-accepted form must build.
        expect(() => express.json({ limit: config["express-body-limit"] })).not.toThrow();
      }
    );

    it("probe sanity: body-parser really does reject a non-size limit at construction", () => {
      expect(() => express.json({ limit: "garbage" })).toThrow(TypeError);
    });
  });

  // ---- cors-allowed-origins -> cors (middleware.ts)

  describe("cors-allowed-origins -> cors({ origin }) applied per request", () => {
    const corsOrigins = [
      "http://10.10.10.7:4200",
      "https://sensors.example.com",
      "http://192.168.1.100",
      "https://sensors.example.com:8443",
    ];

    const config = withConfig({ "cors-allowed-origins": corsOrigins });
    const app = express();
    // The exact consumer and argument shape middleware.ts installs.
    app.use(cors({ origin: config["cors-allowed-origins"] ?? [] }));
    app.get("/cors-boundary-check", (_req, res) => res.status(200).end());

    it.each(corsOrigins)("cors() honors a Zod-accepted origin (reflected in ACAO): %s", async (origin) => {
      const response = await request(app).get("/cors-boundary-check").set("Origin", origin);
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(origin);
    });

    it("the allowlist is actually in effect: an unlisted origin gets no CORS header", async () => {
      // Negative control — proves the configured list reached cors() and is
      // enforced, not silently ignored (which would make every origin pass).
      const response = await request(app).get("/cors-boundary-check").set("Origin", "http://unlisted.example.com");
      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  // ---- fetch timeouts -> AbortSignal (pingerController, generalController)

  describe("ippinger-fetch-timeout-ms -> AbortSignal.timeout() (the call sites' exact mechanism)", () => {
    it.each([1, 1_000, 8_000, 15_000])("accepts a Zod-validated timeout of %i ms", (ms) => {
      const config = withConfig({ "ippinger-fetch-timeout-ms": ms });
      const timeoutMs = resolveIppingerFetchTimeoutMs(config);
      expect(timeoutMs).toBe(ms);
      expect(() => AbortSignal.timeout(timeoutMs)).not.toThrow();
    });

    it("a Zod-accepted 1 ms timeout actually aborts (not merely constructible)", async () => {
      const config = withConfig({ "ippinger-fetch-timeout-ms": 1 });
      const signal = AbortSignal.timeout(resolveIppingerFetchTimeoutMs(config));
      // AbortSignal is not thenable — await it via its abort event.
      await new Promise<void>((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      expect(signal.aborted).toBe(true);
    });
  });

  // ---- command-silence-timeout-ms -> MqttCommandControl

  describe("command-silence-timeout-ms -> MqttCommandControl's silence timer", () => {
    it.each([1_500, 9_999, 10_000])("arms a working silence timer for a Zod-validated %i ms", (ms) => {
      const config = withConfig({ "command-silence-timeout-ms": ms });
      const control = new MqttCommandControl(config["command-silence-timeout-ms"]!);
      control.initialize();
      expect(control.timeout_duration_ms).toBe(ms);
      // restart_clock() must have armed the setTimeout with the configured
      // value — an unusable value would leave the command layer hanging.
      expect(control.timeout).not.toBeNull();
      control.deinitialize();
    });

    it("a Zod-accepted 1 ms silence timeout actually expires on the control's clock", async () => {
      const config = withConfig({ "command-silence-timeout-ms": 1 });
      const control = new MqttCommandControl(config["command-silence-timeout-ms"]!);
      control.initialize();
      await control.waitForCompletion();
      expect(control.is_timed_out).toBe(true);
      control.deinitialize();
    });
  });

  // ---- service URLs -> template-literal call sites

  describe("ip-pinger-web-api / sensor-telemetry-api -> template-literal URL building at the call sites", () => {
    const serviceOrigins = ["http://10.10.10.50:3300", "https://pinger.example.com", "http://127.0.0.1:8080"];
    // Every path the call sites append: `${origin}/health` (generalController),
    // `${origin}/about|read-config|write-config|restart|ping[/:target]` (pingerController).
    const appendedPaths = ["/about", "/health", "/ping", "/ping/10.0.0.5", "/read-config", "/restart", "/write-config"];

    it.each(serviceOrigins)("a Zod-accepted origin %s templates into a valid URL at every call site (both keys)", (origin) => {
      for (const key of ["ip-pinger-web-api", "sensor-telemetry-api"] as const) {
        const config = withConfig({ [key]: origin });
        const value = config[key];
        expect(value).toBe(origin);
        for (const path of appendedPaths) {
          const url = new URL(`${value}${path}`);
          expect(url.protocol).toMatch(/^https?:$/);
          expect(url.host).toBe(new URL(origin).host);
          // A trailing "/" (→ "//health") or an embedded path (→ "/extra/health")
          // would surface only here — as a runtime 404, "service unavailable".
          expect(url.pathname).toBe(path);
        }
      }
    });
  });

  // ---- swagger-server-url -> OpenAPI spec

  describe("swagger-server-url -> OpenAPI servers[].url (used verbatim in swagger.ts)", () => {
    it("a Zod-validated override is a URL consumable verbatim as servers[0].url", () => {
      const config = withConfig({ "swagger-server-url": "https://sensors.example.com/api/" });
      const url = new URL(config["swagger-server-url"]!);
      expect(url.protocol).toMatch(/^https?:$/);
      expect(url.hostname).not.toBe("");
    });
  });

  // ---- loki-url -> winston-loki (dodsonlabs/Logger)

  describe("loki-url -> winston-loki host option (Logger constructs the transport with it verbatim)", () => {
    it.each([
      "http://10.10.10.60:3100",
      "http://lokiuser:secretpw@10.10.10.60:3100",
      "https://loki.example.com/loki",
    ])("winston-loki accepts a Zod-validated loki-url %s as its host", (value) => {
      const config = withConfig({ "loki-url": value, "loki-enabled": true });
      // The acceptance point is in the Batcher constructor: winston-loki
      // builds new URL(host + "/loki/api/v1/push") and derives auth headers
      // from the URL's embedded credentials, synchronously.
      // json + batching keep the probe in unit scope: json skips the native
      // snappy addon (its binding holds a process-lifetime handle jest cannot
      // exit past) and batching stops the constructor from starting the
      // 5-second push loop. Neither changes how `host` is accepted.
      const transport = new LokiTransport({
        host: config["loki-url"]!,
        labels: { app: "sensor-services", env: "test" },
        json: true,
        batching: false,
        gracefulShutdown: false,
      });
      transport.end();
      expect(transport).toBeInstanceOf(LokiTransport);
    });
  });
});
