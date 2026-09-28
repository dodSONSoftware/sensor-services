/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { create_mqtt_command_message, getDetails } from "../../../src/controllers/sensorController";
import type { MqttNetworking } from "../../../src/dodsonlabs/MqttNetworking";
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

  describe("already-running path", () => {
    it("should wait for completion when command is already running (get path)", async () => {
      const network = makeMockNetwork({ is_running: true });
      const res = await hitGetItRoute(network, "/sensors/get-details");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("should wait for completion when command is already running (post path)", async () => {
      const network = makeMockNetwork({ is_running: true });
      const res = await hitPostItRoute(network, "/sensors/write-config/sensor-1", { key: "value" });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
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

      jest.advanceTimersByTime(10_001);

      await idPromise;

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.send).toHaveBeenCalledWith([{ source: "test", payload: {} }]);
      expect(mockCommandControl.deinitialize).toHaveBeenCalled();
    }, 15000);
  });
});
