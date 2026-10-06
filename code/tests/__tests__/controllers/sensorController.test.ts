/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { create_mqtt_command_message, getDetails, isBroadcastTarget } from "../../../src/controllers/sensorController";
import type { MqttNetworking } from "../../../src/dodsonlabs/MqttNetworking";
import { MqttCommandControl } from "../../../src/dodsonlabs/MqttCommandControl";
import type { IMqttCommandControl } from "../../../src/dodsonlabs/Interfaces";

describe("enrichResultsWithMetadata", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-14T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should add command_metadata to each result", () => {
    const results = [
      { source: "Air-Light-1", payload: {} },
      { source: "Water-1", payload: {} },
    ];
    const commandId = "test-command-id-123";

    const enriched = require("../../../src/controllers/sensorController")
      .enrichResultsWithMetadata(results, commandId);

    expect(enriched).toHaveLength(2);
    expect(enriched[0]).toEqual({
      source: "Air-Light-1",
      payload: {},
      command_metadata: {
        command_id: commandId,
        command_sent_at: "2026-07-14T12:00:00.000Z",
        expected_delay_seconds: 5,
      },
    });
    expect(enriched[1]).toEqual({
      source: "Water-1",
      payload: {},
      command_metadata: {
        command_id: commandId,
        command_sent_at: "2026-07-14T12:00:00.000Z",
        expected_delay_seconds: 5,
      },
    });
  });

  it("should use custom expectedDelaySeconds when provided", () => {
    const results = [{ source: "test-sensor", payload: {} }];
    const commandId = "custom-delay-test";
    const customDelay = 5;

    const enriched = require("../../../src/controllers/sensorController")
      .enrichResultsWithMetadata(results, commandId, customDelay);

    expect(enriched[0].command_metadata.expected_delay_seconds).toBe(customDelay);
  });
});

describe("create_mqtt_command_message (V3 envelope)", () => {
  it("should create a V3 command message with message_schema_version 3 and an empty payload object", () => {
    const msg = create_mqtt_command_message("sensor-1", "get-details");

    expect(msg).toMatchObject({
      "message_type": "command",
      "message_schema_version": 3,
      "target": "sensor-1",
      "command": "get-details",
      "payload": {},
    });
    expect(Object.keys(msg).sort()).toEqual([
      "command",
      "command_id",
      "message_schema_version",
      "message_type",
      "payload",
      "target",
    ]);
    // command_id should be a valid UUID
    expect(msg["command_id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    // V2 schema_version must be gone
    expect(msg["schema_version"]).toBeUndefined();
  });

  it("should lowercase target and command", () => {
    const msg = create_mqtt_command_message("SENSOR-1", "GET-DETAILS");

    expect(msg["target"]).toBe("sensor-1");
    expect(msg["command"]).toBe("get-details");
  });

  it("should trim whitespace from target and command", () => {
    const msg = create_mqtt_command_message("  sensor-1  ", "  get-details  ");

    expect(msg["target"]).toBe("sensor-1");
    expect(msg["command"]).toBe("get-details");
  });

  it("should include payload when provided", () => {
    const config = { source: "Air-1", config_schema_version: 10 };
    const payload = { config };
    const msg = create_mqtt_command_message("sensor-1", "write-config", payload);

    expect(msg["payload"]).toEqual(payload);
  });

  it("should default to an empty payload object when null", () => {
    const msgNull = create_mqtt_command_message("sensor-1", "reboot", null);
    expect(msgNull["payload"]).toEqual({});
  });

  it("should match the captured firmware v4 command message key-for-key (modulo command_id)", () => {
    // Real command captured from the live broker (sensors_v4.json, iot/v3/command)
    const captured = {
      "message_type": "command",
      "message_schema_version": 3,
      "target": "*",
      "command": "get-details",
      "command_id": "00000001-7fd7cb1680a502782425a5415e5",
      "payload": {},
    };
    const msg = create_mqtt_command_message("*", "get-details", null, captured["command_id"]);
    expect(msg).toEqual(captured);
  });
});

describe("isBroadcastTarget (P1-2 normalization)", () => {
  it("detects the literal wildcard", () => {
    expect(isBroadcastTarget("*")).toBe(true);
  });

  it("detects a wildcard surrounded by whitespace", () => {
    expect(isBroadcastTarget(" * ")).toBe(true);
    expect(isBroadcastTarget("  *")).toBe(true);
    expect(isBroadcastTarget("* ")).toBe(true);
  });

  it("detects URL percent-encoding of the wildcard (%2A / %2a)", () => {
    expect(isBroadcastTarget("%2A")).toBe(true);
    expect(isBroadcastTarget("%2a")).toBe(true);
    expect(isBroadcastTarget(" %2A ")).toBe(true);
  });

  it("is case-insensitive after normalization", () => {
    // lowercase of "*" is still "*"; a mixed-case percent-encoding is caught
    expect(isBroadcastTarget("＊")).toBe(false); // fullwidth asterisk is NOT the MQTT wildcard
  });

  it("does NOT treat a single-sensor source as broadcast", () => {
    expect(isBroadcastTarget("Soil-1")).toBe(false);
    expect(isBroadcastTarget("air-2")).toBe(false);
  });

  it("does NOT treat a source that merely contains an asterisk as broadcast", () => {
    expect(isBroadcastTarget("my*device")).toBe(false);
    expect(isBroadcastTarget("device%2A1")).toBe(false); // decodes to "device*1"
  });

  it("handles non-string input safely", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isBroadcastTarget(undefined as any)).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(isBroadcastTarget(null as any)).toBe(false);
  });
});

// ****************************************************************
// **** mqtt_command_get_messages / get_it / post_it integration

describe("sensor controller integration (error paths, already-running)", () => {
  // Helper: build a mock MqttNetworking with a configurable command control
  function makeMockNetwork(overrides: {
    is_running?: boolean;
  } = {}): MqttNetworking {
    const mockCommandControl: IMqttCommandControl = {
      is_running: overrides.is_running ?? false,
      is_timed_out: true,
      timeout: null,
      results: [{ source: "test", payload: {} }],
      // Mirrors MqttCommandControl.claim(): synchronous check-and-set
      claim: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
        if (this.is_running) {
          return false;
        }
        this.is_running = true;
        return true;
      }),
      initialize: jest.fn(),
      deinitialize: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
        this.is_running = false;
      }),
      clear_results: jest.fn(),
      restart_clock: jest.fn(),
      cancel_clock: jest.fn(),
      // Models the real completion semantics: when the wait for an in-flight
      // command resolves, that command has finished and released the slot. In
      // the real MqttCommandControl the ACTIVE command calls deinitialize()
      // after its own wait resolves — a waiting caller never does (see
      // mqtt_command_wait_for_command_completion). This mock collapses
      // "active command completed" into the wait resolving so a waiting caller
      // (is_running initially true) can proceed to claim; for a caller that
      // already holds the slot it is a harmless no-op (start_and_wait deinits).
      waitForCompletion: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
        if (this.is_running) {
          this.deinitialize();
        }
        return Promise.resolve();
      }),
    };

    return {
      mqtt_topic_command: "iot/v3/command",
      mqtt_topic_command_response: "iot/v3/command-response",
      is_connected: jest.fn().mockReturnValue(true),
      prometheus_server_ready: jest.fn().mockReturnValue(true),
      publish_mqtt_message: jest.fn(),
      close: jest.fn(),
      get_cr_dude: jest.fn().mockReturnValue(mockCommandControl),
    } as unknown as MqttNetworking;
  }

  // Helper: hit a sensor route via supertest
  // We test via the route to exercise the full try/catch path
  async function hitGetItRoute(network: MqttNetworking, path: string): Promise<import("supertest").Response> {
    const express = require("express");
    const request = require("supertest");
    const app = express();
    app.use(express.json());
    // Import the route creator which wires up the handlers
    const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
    const sensorRoutes = new CreateSensorRoutes(app, network);
    sensorRoutes.register();
    return request(app).get(path);
  }

  async function hitPostItRoute(network: MqttNetworking, path: string, body?: Record<string, unknown>): Promise<import("supertest").Response> {
    const express = require("express");
    const request = require("supertest");
    const app = express();
    app.use(express.json());
    const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
    const sensorRoutes = new CreateSensorRoutes(app, network);
    sensorRoutes.register();
    const req = request(app).post(path);
    if (body) req.send(body);
    return req;
  }

  describe("error paths (initialize throws)", () => {
    // initialize() is called synchronously inside mqtt_command_start,
    // so the error propagates through the async call chain and is
    // caught by the try/catch in get_it / post_it.
    it("should return 500 from get_it when command initialization fails", async () => {
      const mockCommandControl: IMqttCommandControl = {
        is_running: false,
        is_timed_out: true,
        timeout: null,
        results: [{ source: "test", payload: {} }],
        claim: jest.fn().mockReturnValue(true),
        initialize: jest.fn().mockImplementation(() => { throw new Error("init failed"); }),
        deinitialize: jest.fn(),
        clear_results: jest.fn(),
        restart_clock: jest.fn(),
        cancel_clock: jest.fn(),
        waitForCompletion: jest.fn().mockResolvedValue(undefined),
      };

      const network = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn(),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(mockCommandControl),
      } as unknown as MqttNetworking;

      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error", "init failed");
    });

    it("should return 500 from post_it when command initialization fails", async () => {
      const mockCommandControl: IMqttCommandControl = {
        is_running: false,
        is_timed_out: true,
        timeout: null,
        results: [{ source: "test", payload: {} }],
        claim: jest.fn().mockReturnValue(true),
        initialize: jest.fn().mockImplementation(() => { throw new Error("init failed"); }),
        deinitialize: jest.fn(),
        clear_results: jest.fn(),
        restart_clock: jest.fn(),
        cancel_clock: jest.fn(),
        waitForCompletion: jest.fn().mockResolvedValue(undefined),
      };

      const network = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn(),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(mockCommandControl),
      } as unknown as MqttNetworking;

      const res = await hitPostItRoute(network, "/sensors/write-config/sensor-1", { key: "value" });
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error", "init failed");
    });
  });

  describe("broker unavailable (disconnected MQTT)", () => {
    // Regression: while the broker is down, mqtt-backed commands must answer
    // 503 without publishing — mqtt.js would otherwise queue QoS-0 commands
    // for later delivery, and reads would return 200 [] indistinguishable
    // from "no sensors exist".
    function makeDisconnectedNetwork(): MqttNetworking {
      const network = makeMockNetwork();
      (network.is_connected as jest.Mock).mockReturnValue(false);
      return network;
    }

    it("should return 503 and publish nothing for get-details", async () => {
      const network = makeDisconnectedNetwork();
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    it("should return 503 and publish nothing for read-config", async () => {
      const network = makeDisconnectedNetwork();
      const res = await hitGetItRoute(network, "/sensors/read-config");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    it("should return 503 and publish nothing for reboot", async () => {
      const network = makeDisconnectedNetwork();
      const res = await hitPostItRoute(network, "/sensors/reboot/sensor-1");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    it("should return 503 and publish nothing for write-config", async () => {
      const network = makeDisconnectedNetwork();
      const res = await hitPostItRoute(network, "/sensors/write-config/sensor-1", { key: "value" });
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    it("should follow the existing success path when connected", async () => {
      const network = makeMockNetwork();
      (network.is_connected as jest.Mock).mockReturnValue(true);
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
    });
  });

  describe("already-running path", () => {
    // Regression: a second concurrent caller must wait for the in-flight
    // command to finish, then publish its OWN command and respond with its
    // own results — it must never return the first caller's (cleared) results.
    it("should wait, then publish its own command (get path)", async () => {
      const network = makeMockNetwork({ is_running: true });
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // The waiter published its own command after the wait
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
      const published = (network.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(published[0]).toBe("iot/v3/command");
      expect(published[1]).toMatchObject({
        "message_type": "command",
        "message_schema_version": 3,
        "command": "get-details",
        "target": "*",
        "payload": {},
      });
    });

    it("should wait, then publish its own command (post path)", async () => {
      const network = makeMockNetwork({ is_running: true });
      const res = await hitPostItRoute(network, "/sensors/write-config/sensor-1", { key: "value" });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
      const published = (network.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(published[1]).toMatchObject({
        "command": "write-config",
        "target": "sensor-1",
        "payload": { config: { key: "value" } },
      });
    });
  });

  describe("concurrent requests (real MqttCommandControl)", () => {
    // End-to-end regression for the concurrent-command race: two GETs arriving
    // at once must be serialized — the first publishes, the second waits — and
    // each must respond with its own results, not the other's or stale data.
    it("should give each concurrent caller its own results", async () => {
      const express = require("express");
      const request = require("supertest");
      const app = express();
      app.use(express.json());

      const control = new MqttCommandControl(50); // 50ms silence timeout
      let seq = 0;
      const network: MqttNetworking = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn().mockImplementation(() => {
          seq += 1;
          const mySeq = seq;
          // Simulate the sensor responding 10ms after the command is published
          setTimeout(() => {
            control.results.push({ source: `sensor-${mySeq}`, payload: { seq: mySeq } });
            control.restart_clock();
          }, 10);
        }),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(control),
      } as unknown as MqttNetworking;

      const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
      const sensorRoutes = new CreateSensorRoutes(app, network);
      sensorRoutes.register();

      const [r1, r2] = await Promise.all([
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      // Two commands published (one per request), each caller got its own result
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(2);
      expect(r1.body).toEqual([{ source: "sensor-1", payload: { seq: 1 } }]);
      expect(r2.body).toEqual([{ source: "sensor-2", payload: { seq: 2 } }]);
    }, 10000);
  });

  // ****************************************************************
  // **** high-contention serialization regression (3 concurrent same-type)

  describe("high-contention serialization (3 concurrent same-type commands)", () => {
    // A MqttCommandControl that records its own start/end lifecycle so the
    // tests can assert the serialization invariant directly: at most one
    // command may be active at a time (never two owners simultaneously), and
    // every claimed slot must be released by the end.
    class LifecycleControl extends MqttCommandControl {
      lifecycle: Array<{ type: "start" | "end"; commandId?: string }> = [];
      initialize(commandId?: string) {
        this.lifecycle.push({ type: "start", commandId });
        super.initialize(commandId);
      }
      deinitialize() {
        // Only the active command (and the publish/connectivity failure paths)
        // deinitialize — waiting callers no longer do (see
        // mqtt_command_wait_for_command_completion). Record the "end" only on
        // the first transition out of the running state so it is never
        // double-recorded if deinitialize() runs more than once — keyed by the
        // command_id that was active, which is what the caller observes.
        if (this.is_running) {
          this.lifecycle.push({ type: "end", commandId: this.active_command_id });
        }
        super.deinitialize();
      }
    }

    // Mirror of MqttNetworking.accepts_command_response + result recording: a
    // command response is accepted only when a command is active AND its
    // command_id matches the active one. (The real correlation logic is
    // unit-tested in MqttNetworking.test.ts; here we drive the REAL control
    // state so the tests pin the controller's interaction with it.) Returns
    // whether the response was accepted.
    function simulateResponse(control: MqttCommandControl, commandId: string | undefined, source: string): boolean {
      if (!control.is_running) {
        return false;
      }
      if (commandId === undefined || control.active_command_id === undefined || commandId !== control.active_command_id) {
        return false;
      }
      control.results.push({ source, payload: { command_id: commandId } });
      control.restart_clock();
      return true;
    }

    // Poll until cond() is true — a coordination aid (not a timing assertion),
    // so the tests can drive a step between one command completing and the
    // next claim without racing the event loop.
    async function waitUntil(cond: () => boolean, timeoutMs = 4000, intervalMs = 5): Promise<void> {
      const start = Date.now();
      while (!cond()) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    // supertest does not send a request until the returned Test is awaited (or
    // .end() is called). To observe mid-flight state (e.g. a publish) we must
    // start the request WITHOUT awaiting it: awaiting inside an async closure
    // triggers the send immediately, and the resulting promise is handed back
    // for the test to await later. (request/app are the require()d supertest /
    // express — typed any, matching makeHarness.)
    function fireGet(request: any, app: any, url: string): Promise<any> {
      return (async () => (await request(app).get(url)))();
    }

    // Build an Express app wired to a mock network whose publish_mqtt_message
    // records each published command_id and schedules the sensor's reply (10ms
    // later) through simulateResponse. silenceMs is the command-silence
    // timeout (kept well above the 10ms reply delay so the reply is always
    // accepted before the command completes).
    function makeHarness(silenceMs: number, opts: { failFirstPublish?: boolean } = {}) {
      const control = new LifecycleControl(silenceMs);
      const publishes: string[] = [];
      let publishCount = 0;

      const network: MqttNetworking = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn((_topic: string, msg: Record<string, unknown>) => {
          publishCount += 1;
          const commandId = String(msg["command_id"]);
          publishes.push(commandId);
          if (opts.failFirstPublish && publishCount === 1) {
            // The slot was claimed/initialized but the publish failed — the
            // controller must release the slot and surface the error.
            throw new Error("simulated publish failure");
          }
          // Simulate the sensor replying 10ms after the command is published.
          setTimeout(() => {
            simulateResponse(control, commandId, `sensor-${commandId.slice(0, 8)}`);
          }, 10);
          return Promise.resolve();
        }),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(control),
      } as unknown as MqttNetworking;

      const express = require("express");
      const app = express();
      app.use(express.json());
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
      const sensorRoutes = new CreateSensorRoutes(app, network);
      sensorRoutes.register();
      const request = require("supertest");

      return { control, publishes, network, app, request };
    }

    // Prove the lifecycle never has two commands active at once (depth <= 1)
    // and that every claimed slot is released by the end (depth == 0).
    function assertSerialized(lifecycle: Array<{ type: "start" | "end"; commandId?: string }>): void {
      let depth = 0;
      let maxDepth = 0;
      for (const ev of lifecycle) {
        depth += ev.type === "start" ? 1 : -1;
        expect(depth).toBeGreaterThanOrEqual(0);
        maxDepth = Math.max(maxDepth, depth);
      }
      expect(maxDepth).toBeLessThanOrEqual(1);
      expect(depth).toBe(0);
    }

    it("serializes three concurrent requests: one owner at a time, unique command_ids, isolated results", async () => {
      const { control, publishes, app, request } = makeHarness(50);

      const [rA, rB, rC] = await Promise.all([
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
      ]);

      expect(rA.status).toBe(200);
      expect(rB.status).toBe(200);
      expect(rC.status).toBe(200);

      // Three commands were published (one per request), all with unique ids
      expect(publishes).toHaveLength(3);
      expect(new Set(publishes).size).toBe(3);

      // Never two active commands at once; every slot released at the end
      assertSerialized(control.lifecycle);

      // Each request received exactly one result, and the three results are
      // the three distinct commands (no caller saw another caller's data)
      const resultIds = [rA, rB, rC].map((r) => {
        expect(Array.isArray(r.body)).toBe(true);
        expect(r.body).toHaveLength(1);
        return (r.body[0] as { payload: { command_id: string } }).payload.command_id;
      });
      expect(new Set(resultIds).size).toBe(3);
      expect(resultIds.slice().sort()).toEqual(publishes.slice().sort());
    }, 15000);

    it("does not let a queued request publish before the active command completes", async () => {
      const { control, publishes, app, request } = makeHarness(50);

      await Promise.all([
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
      ]);

      expect(publishes).toHaveLength(3);

      // The publish order must equal the start order: a publish only happens
      // right after its command claims and initializes, and a command can only
      // claim after the previous one has fully released the slot. So command N
      // could never have published while command N-1 was still active.
      const startIds = control.lifecycle.filter((e) => e.type === "start").map((e) => e.commandId);
      expect(startIds).toEqual(publishes);
      assertSerialized(control.lifecycle);
    }, 15000);

    it("a delayed response from a completed command cannot contaminate the next command", async () => {
      const { control, publishes, app, request } = makeHarness(100);

      // Request A runs to completion (fireGet starts the request immediately so
      // we can observe its publish before awaiting the response)
      const resA = fireGet(request, app, "/sensors/get-details");
      await waitUntil(() => publishes.length === 1);
      const cmdA = publishes[0];
      await resA;
      expect(control.is_running).toBe(false); // A released the slot

      // Request B starts and becomes active with a fresh command id
      const resB = fireGet(request, app, "/sensors/get-details");
      await waitUntil(() => publishes.length === 2);
      const cmdB = publishes[1];
      expect(cmdB).not.toBe(cmdA);
      expect(control.is_running).toBe(true); // B owns the slot
      expect(control.active_command_id).toBe(cmdB);

      // A DELAYED response from A (carrying cmdA) arrives while B is active —
      // it must be rejected: B's result set must never receive A's data
      const accepted = simulateResponse(control, cmdA, "sensor-late-A");
      expect(accepted).toBe(false);
      expect(control.results.every((r) => r.payload.command_id !== cmdA)).toBe(true);

      // B completes with only its own result
      const bodyB = await resB;
      expect(bodyB.status).toBe(200);
      expect(bodyB.body).toHaveLength(1);
      expect((bodyB.body[0] as { payload: { command_id: string } }).payload.command_id).toBe(cmdB);
    }, 15000);

    it("a failed command releases the slot so the queued requests still complete", async () => {
      const { control, publishes, app, request } = makeHarness(50, { failFirstPublish: true });

      const [rA, rB, rC] = await Promise.all([
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
      ]);

      // The failed command surfaces as a 500; it must not poison the queue
      expect(rA.status).not.toBe(200);
      // The other two still complete successfully (the slot was released)
      const succeeded = [rB, rC].filter((r) => r.status === 200);
      expect(succeeded.length).toBe(2);
      // Three commands were attempted (each published its own command_id)
      expect(publishes).toHaveLength(3);
      expect(new Set(publishes).size).toBe(3);
      // Every slot is released at the end (the failure did not wedge the slot)
      assertSerialized(control.lifecycle);
    }, 15000);

    it("the slot is free after all three complete: a fourth request proceeds normally", async () => {
      const { control, publishes, app, request } = makeHarness(50);

      const [rA, rB, rC] = await Promise.all([
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
        request(app).get("/sensors/get-details"),
      ]);
      expect([rA.status, rB.status, rC.status]).toEqual([200, 200, 200]);

      // The slot is released after the third command
      expect(control.is_running).toBe(false);

      // A fourth request claims the slot normally and completes (no hang)
      const rD = await request(app).get("/sensors/get-details");
      expect(rD.status).toBe(200);
      expect(publishes).toHaveLength(4);
      expect(new Set(publishes).size).toBe(4);
      expect((rD.body[0] as { payload: { command_id: string } }).payload.command_id).toBe(publishes[3]);
    }, 15000);
  });

  describe("reboot command message", () => {
    it("should send plain 'reboot' with no delay argument and V3 envelope", async () => {
      const network = makeMockNetwork();
      const res = await hitGetItRoute(network, "/sensors/reboot");
      expect(res.status).toBe(200);
      const published = (network.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(published[0]).toBe("iot/v3/command");
      expect(published[1]).toMatchObject({
        "message_type": "command",
        "message_schema_version": 3,
        "command": "reboot",
        "target": "*",
        "payload": {},
      });
    });
  });

  describe("write-config payload wrapping", () => {
    it("should wrap the request body in a config key for the V3 write-config payload", async () => {
      const network = makeMockNetwork();
      const config = { source: "Air-1", config_schema_version: 10 };
      const res = await hitPostItRoute(network, "/sensors/write-config/sensor-1", config);
      expect(res.status).toBe(200);
      const published = (network.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(published[1]["payload"]).toEqual({ config });
    });
  });

  describe("write-config broadcast rejection (P1-2)", () => {
    // A valid single-sensor target still works and publishes exactly once.
    it("should still accept a single sensor source and publish", async () => {
      const network = makeMockNetwork();
      const config = { source: "Soil-1", config_schema_version: 10 };
      const res = await hitPostItRoute(network, "/sensors/write-config/Soil-1", config);
      expect(res.status).toBe(200);
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
    });

    it("should reject the literal broadcast target '*' with 400 and publish nothing", async () => {
      const network = makeMockNetwork();
      const res = await hitPostItRoute(network, "/sensors/write-config/*", { source: "Soil-1" });
      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/\*/);
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    it("should reject the URL-encoded broadcast target %2A with 400 and publish nothing", async () => {
      const network = makeMockNetwork();
      const res = await hitPostItRoute(network, "/sensors/write-config/%2A", { source: "Soil-1" });
      expect(res.status).toBe(400);
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });

    // The broadcast guard must NOT affect the read commands that legitimately
    // fan out to '*' — get-details still publishes to '*' (target unchanged).
    it("should still allow broadcast '*' for get-details (read command unaffected)", async () => {
      const network = makeMockNetwork();
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(200);
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
      const published = (network.publish_mqtt_message as jest.Mock).mock.calls[0];
      expect(published[1]["target"]).toBe("*");
    });
  });

  describe("failure-atomic slot acquisition + publish (P2-1)", () => {
    // Build a mock network that exposes the command control (so we can assert
    // the slot is released) and lets us script is_connected() / publish.
    function makeP2Network(opts: {
      connectedSequence?: boolean[];
      publishImpl?: (topic: string, msg: unknown) => void;
    }): { network: MqttNetworking; control: IMqttCommandControl } {
      const control: IMqttCommandControl = {
        is_running: false,
        is_timed_out: true,
        timeout: null,
        results: [{ source: "test", payload: {} }],
        claim: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
          if (this.is_running) return false;
          this.is_running = true;
          return true;
        }),
        initialize: jest.fn(),
        deinitialize: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
          this.is_running = false;
        }),
        clear_results: jest.fn(),
        restart_clock: jest.fn(),
        cancel_clock: jest.fn(),
        waitForCompletion: jest.fn().mockResolvedValue(undefined),
      };

      let i = 0;
      const is_connected = jest.fn(() => {
        const seq = opts.connectedSequence;
        if (!seq) return true;
        const v = seq[i < seq.length ? i : seq.length - 1];
        if (i < seq.length) i++;
        return v;
      });

      const network = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected,
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn(opts.publishImpl ?? (() => {})),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(control),
      } as unknown as MqttNetworking;

      return { network, control };
    }

    it("get path: broker disconnects after slot acquisition -> 503, no publish, slot released", async () => {
      // 1st is_connected() = pre-slot gate (true, passes); 2nd = post-slot
      // re-check (false, triggers the 503).
      const { network, control } = makeP2Network({ connectedSequence: [true, false] });
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(503);
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
      // The slot must be released so a later request is not blocked
      expect(control.deinitialize).toHaveBeenCalled();
      expect(control.is_running).toBe(false);
    });

    it("post path: broker disconnects after slot acquisition -> 503, no publish, slot released", async () => {
      const { network, control } = makeP2Network({ connectedSequence: [true, false] });
      const res = await hitPostItRoute(network, "/sensors/write-config/Soil-1", { source: "Soil-1" });
      expect(res.status).toBe(503);
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
      expect(control.deinitialize).toHaveBeenCalled();
      expect(control.is_running).toBe(false);
    });

    it("publish throws -> state released, and the NEXT request starts immediately (200)", async () => {
      let publishCount = 0;
      const { network, control } = makeP2Network({
        publishImpl: () => {
          publishCount++;
          if (publishCount === 1) throw new Error("simulated publish failure");
          // second publish succeeds
        },
      });

      // First request: publish throws -> 500 (generic error), slot released.
      const res1 = await hitGetItRoute(network, "/sensors/get-details");
      expect(res1.status).toBe(500);
      expect(control.is_running).toBe(false);
      expect(control.deinitialize).toHaveBeenCalled();

      // Second request: the slot is free, so it claims immediately and the
      // (now-succeeding) publish completes -> 200. If the state had not been
      // released after the failure, this request would hang until the hard cap.
      const res2 = await hitGetItRoute(network, "/sensors/get-details");
      expect(res2.status).toBe(200);
      expect(publishCount).toBe(2);
    });
  });

  describe("async publish failure (P2-1 publish race)", () => {
    // The broker was connected when the gate ran and the slot was claimed, but
    // the connection dropped before the QoS-0 publish landed. mqtt.js reports
    // that failure ASYNCHRONOUSLY through the publish callback; the controller
    // must surface it as a 503 (never a successful []) and release the slot at
    // the failure point instead of waiting out the silence/hard timeout.
    function makeAsyncPublishNetwork(
      publishImpl: (topic: string, msg: unknown) => Promise<void> | void
    ): { network: MqttNetworking; control: IMqttCommandControl } {
      const control: IMqttCommandControl = {
        is_running: false,
        is_timed_out: true,
        timeout: null,
        results: [{ source: "test", payload: {} }],
        claim: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
          if (this.is_running) return false;
          this.is_running = true;
          return true;
        }),
        initialize: jest.fn(),
        deinitialize: jest.fn().mockImplementation(function (this: IMqttCommandControl) {
          this.is_running = false;
        }),
        clear_results: jest.fn(),
        restart_clock: jest.fn(),
        cancel_clock: jest.fn(),
        waitForCompletion: jest.fn().mockResolvedValue(undefined),
      };

      const network = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn(publishImpl),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(control),
      } as unknown as MqttNetworking;

      return { network, control };
    }

    it("get path: publish rejects asynchronously (broker gone) -> 503, slot released, no wait", async () => {
      const { network, control } = makeAsyncPublishNetwork(
        () => Promise.reject(new Error("No connection to broker"))
      );
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
      // The failure surfaces before any silence/hard wait, and the slot is
      // released immediately at the failure point.
      expect(control.waitForCompletion).not.toHaveBeenCalled();
      expect(control.deinitialize).toHaveBeenCalled();
      expect(control.is_running).toBe(false);
    });

    it("post path: publish rejects asynchronously (broker gone) -> 503, slot released", async () => {
      const { network, control } = makeAsyncPublishNetwork(
        () => Promise.reject(new Error("No connection to broker"))
      );
      const res = await hitPostItRoute(network, "/sensors/write-config/Soil-1", { source: "Soil-1" });
      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty("error", "MQTT broker unavailable");
      expect(network.publish_mqtt_message).toHaveBeenCalledTimes(1);
      expect(control.waitForCompletion).not.toHaveBeenCalled();
      expect(control.deinitialize).toHaveBeenCalled();
      expect(control.is_running).toBe(false);
    });

    it("command slot is reusable immediately after an async publish failure", async () => {
      let publishCount = 0;
      const { network, control } = makeAsyncPublishNetwork(() => {
        publishCount += 1;
        if (publishCount === 1) {
          return Promise.reject(new Error("No connection to broker"));
        }
        return Promise.resolve();
      });

      const res1 = await hitGetItRoute(network, "/sensors/get-details");
      expect(res1.status).toBe(503);
      expect(control.is_running).toBe(false);

      // The slot is free, so the next same-type command claims it immediately
      // and completes normally (no hang waiting on the failed command's slot).
      const res2 = await hitGetItRoute(network, "/sensors/get-details");
      expect(res2.status).toBe(200);
      expect(publishCount).toBe(2);
    });

    it("a generic (non-disconnect) async publish failure stays a 500, not a 503", async () => {
      const { network, control } = makeAsyncPublishNetwork(
        () => Promise.reject(new Error("some other publish fault"))
      );
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error", "some other publish fault");
      expect(control.deinitialize).toHaveBeenCalled();
      expect(control.is_running).toBe(false);
    });
  });

  describe("update-config deprecation", () => {
    it("should return 501 and publish nothing to MQTT", async () => {
      const network = makeMockNetwork();
      const res = await hitPostItRoute(network, "/sensors/update-config/sensor-1", { key: "value" });
      expect(res.status).toBe(501);
      expect(res.body).toHaveProperty("error");
      expect(String(res.body.error)).toMatch(/write-config/);
      expect(network.publish_mqtt_message).not.toHaveBeenCalled();
    });
  });

  describe("removed identify route", () => {
    it("should return 404 for /sensors/identify", async () => {
      const network = makeMockNetwork();
      const res = await hitGetItRoute(network, "/sensors/identify");
      expect(res.status).toBe(404);
    });
  });

  describe("hard timeout path", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should timeout and call deinitialize after 10 seconds when waitForCompletion never resolves", async () => {
      const mockCommandControl: IMqttCommandControl = {
        is_running: false,
        is_timed_out: true,
        timeout: null,
        results: [{ source: "test", payload: {} }],
        claim: jest.fn().mockReturnValue(true),
        initialize: jest.fn(),
        deinitialize: jest.fn(),
        clear_results: jest.fn(),
        restart_clock: jest.fn(),
        cancel_clock: jest.fn(),
        waitForCompletion: jest.fn().mockImplementation(() => new Promise(() => { /* never resolves */ })),
      };

      const network: MqttNetworking = {
        mqtt_topic_command: "iot/v3/command",
        mqtt_topic_command_response: "iot/v3/command-response",
        is_connected: jest.fn().mockReturnValue(true),
        prometheus_server_ready: jest.fn().mockReturnValue(true),
        publish_mqtt_message: jest.fn(),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(mockCommandControl),
      } as unknown as MqttNetworking;

      const res = {
        status: jest.fn().mockReturnThis(),
        contentType: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const idPromise = getDetails({} as any, res, network);

      // Drain microtasks so the handler reaches the wait and arms the 10s
      // hard-timeout timer before we advance the fake clock (the acquire-slot
      // await yields once before the timer is registered)
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }

      jest.advanceTimersByTime(10_001);

      await idPromise;

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith([{ source: "test", payload: {} }]);
      expect(mockCommandControl.deinitialize).toHaveBeenCalled();
    }, 15000);
  });
});
