/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { create_mqtt_command_message, getDetails } from "../../../src/controllers/sensorController";
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
      waitForCompletion: jest.fn().mockResolvedValue(undefined),
    };

    return {
      mqtt_topic_command: "iot/v3/command",
      mqtt_topic_command_response: "iot/v3/command-response",
      is_connected: jest.fn().mockReturnValue(true),
      prometheus_server_ready: jest.fn().mockReturnValue(true),
      publish_mqtt_message: jest.fn(),
      register_command_id: jest.fn(),
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
    new CreateSensorRoutes(app, network);
    return request(app).get(path);
  }

  async function hitPostItRoute(network: MqttNetworking, path: string, body?: Record<string, unknown>): Promise<import("supertest").Response> {
    const express = require("express");
    const request = require("supertest");
    const app = express();
    app.use(express.json());
    const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
    new CreateSensorRoutes(app, network);
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
        register_command_id: jest.fn(),
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
        register_command_id: jest.fn(),
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
        register_command_id: jest.fn(),
        close: jest.fn(),
        get_cr_dude: jest.fn().mockReturnValue(control),
      } as unknown as MqttNetworking;

      const { CreateSensorRoutes } = require("../../../src/routes/sensorRoutes");
      new CreateSensorRoutes(app, network);

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
        register_command_id: jest.fn(),
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
