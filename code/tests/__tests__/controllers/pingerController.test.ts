/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { analyzeIt, createAnalyzeResult, getAnalyzeIpPinger } from "../../../src/controllers/pingerController";
import type { MqttNetworking } from "../../../src/dodsonlabs/MqttNetworking";
import type express from "express";

describe("createAnalyzeResult", () => {
  it("should attach state and state-value to a new object without mutating origin", () => {
    const origin = { source: "sensor-1", "ip-address": "192.168.1.10" };
    const result = createAnalyzeResult("OK", { sensor: "", config: "" }, origin);

    expect(result).not.toBe(origin);
    expect(result["state"]).toBe("OK");
    expect(result["state-value"]).toEqual({ sensor: "", config: "" });
    expect(origin).not.toHaveProperty("state");
    expect(origin).not.toHaveProperty("state-value");
  });

  it("should preserve all original properties", () => {
    const origin = { source: "sensor-1", "ip-address": "192.168.1.10", extra: "data" };
    const result = createAnalyzeResult("Offline", { sensor: "", config: "" }, origin);

    expect(result["source"]).toBe("sensor-1");
    expect(result["ip-address"]).toBe("192.168.1.10");
    expect(result["extra"]).toBe("data");
  });
});

describe("analyzeIt", () => {
  describe("case-sensitive mode", () => {
    it("should return OK when source and IP match", () => {
      const liveSensors = [
        { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
      ];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("OK");
    });

    it("should return IP Address Mismatch when source matches but IP differs", () => {
      const liveSensors = [
        { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.99" } } } },
      ];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("IP Address Mismatch");
      expect(results[0]["state-value"]["sensor"]).toBe("192.168.1.99");
      expect(results[0]["state-value"]["config"]).toBe("192.168.1.10");
    });

    it("should return Offline when config device has no live sensor", () => {
      const liveSensors: Record<string, any>[] = [];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("Offline");
    });

    it("should return New when live sensor has no matching config entry", () => {
      const liveSensors = [
        { source: "sensor-new", payload: { data: { network: { ip_address: "192.168.1.50" } } } },
      ];
      const ippingerDevices: Record<string, any>[] = [];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("New");
    });

    it("should return Name Mismatch when IP matches but source differs", () => {
      const liveSensors = [
        { source: "different-name", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
      ];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("Name Mismatch");
      expect(results[0]["state-value"]["sensor"]).toBe("different-name");
      expect(results[0]["state-value"]["config"]).toBe("sensor-1");
    });
  });

  describe("case-insensitive mode", () => {
    it("should match sources with different casing", () => {
      const liveSensors = [
        { source: "Sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
      ];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, false);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("OK");
    });

    it("should detect name mismatch with different casing and same IP", () => {
      const liveSensors = [
        { source: "Different-Name", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
      ];
      const ippingerDevices = [
        { source: "sensor-1", "ip-address": "192.168.1.10" },
      ];

      const results = analyzeIt(liveSensors, ippingerDevices, false);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("Name Mismatch");
    });
  });

  it("should handle multiple sensors and devices", () => {
    const liveSensors = [
      { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
      { source: "sensor-2", payload: { data: { network: { ip_address: "192.168.1.20" } } } },
      { source: "sensor-new", payload: { data: { network: { ip_address: "192.168.1.30" } } } },
    ];
    const ippingerDevices = [
      { source: "sensor-1", "ip-address": "192.168.1.10" },
      { source: "sensor-2", "ip-address": "192.168.1.99" },
      { source: "sensor-offline", "ip-address": "192.168.1.40" },
    ];

    const results = analyzeIt(liveSensors, ippingerDevices, true);

    expect(results).toHaveLength(4);
    const states = results.map((r) => r["state"]);
    expect(states).toContain("OK");
    expect(states).toContain("IP Address Mismatch");
    expect(states).toContain("Offline");
    expect(states).toContain("New");
  });
});

function createMockNetwork(liveResults: unknown[]): MqttNetworking {
  return {

    mqtt_topic_command: "iot/v3/command",
    mqtt_topic_command_response: "iot/v3/command-response",
    is_connected: jest.fn().mockReturnValue(true),
    prometheus_server_ready: jest.fn().mockReturnValue(true),
    publish_mqtt_message: jest.fn(),
    close: jest.fn(),
    get_cr_dude: jest.fn().mockReturnValue({
      is_running: false,
      is_timed_out: true,
      timeout: null,
      results: liveResults,
      claim: jest.fn().mockReturnValue(true),
      initialize: jest.fn(),
      deinitialize: jest.fn(),
      clear_results: jest.fn(),
      restart_clock: jest.fn(),
      cancel_clock: jest.fn(),
      // Return an already-resolved promise so mqtt_command_wait_for_command_completion
      // skips the hard-timeout setTimeout entirely.
      waitForCompletion: jest.fn().mockImplementation(() => Promise.resolve()),
    }),
  } as unknown as MqttNetworking;
}

function createMockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    contentType: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
}

describe("getAnalyzeIpPinger", () => {
  beforeEach(() => {
    // Mock fetch globally
    (globalThis.fetch as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return partial result with warning when IP pinger is unreachable", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const network = createMockNetwork([
      { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
    ]);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getAnalyzeIpPinger(
      {} as express.Request,
      res,
      network,
      "http://192.168.1.4:3300",
      true,
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.contentType).toHaveBeenCalledWith("application/json");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        warning: "ip-pinger service unavailable — analysis incomplete",
        live_sensors: [{ source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } }],
      })
    );
  });

  it("should return full analysis when IP pinger is reachable", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        devices: [
          { source: "sensor-1", "ip-address": "192.168.1.10" },
        ],
      }),
    });

    const network = createMockNetwork([
      { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
    ]);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getAnalyzeIpPinger(
      {} as express.Request,
      res,
      network,
      "http://192.168.1.4:3300",
      true,
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ state: "OK" }),
      ])
    );
    // No warning in the response — it's a full analysis
    const sendArg = (res.send as jest.Mock).mock.calls[0][0];
    expect(sendArg).not.toHaveProperty("warning");
  });

  it("should return partial result with empty live_sensors when both sources fail", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const network = createMockNetwork([]);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getAnalyzeIpPinger(
      {} as express.Request,
      res,
      network,
      "http://192.168.1.4:3300",
      true,
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        warning: "ip-pinger service unavailable — analysis incomplete",
        live_sensors: [],
      })
    );
  });

  it("should return 503 and publish nothing when the pinger is down and the MQTT broker is unavailable", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const network = createMockNetwork([]);
    (network.is_connected as jest.Mock).mockReturnValue(false);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    };

    await getAnalyzeIpPinger(
      {} as express.Request,
      res,
      network,
      "http://192.168.1.4:3300",
      true,
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "MQTT broker unavailable" });
    expect(network.publish_mqtt_message).not.toHaveBeenCalled();
  });

  it("should return 503 and publish nothing when the pinger is reachable but the MQTT broker is unavailable", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        devices: [{ source: "sensor-1", "ip-address": "192.168.1.10" }],
      }),
    });

    const network = createMockNetwork([]);
    (network.is_connected as jest.Mock).mockReturnValue(false);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    };

    await getAnalyzeIpPinger(
      {} as express.Request,
      res,
      network,
      "http://192.168.1.4:3300",
      true,
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "MQTT broker unavailable" });
    expect(network.publish_mqtt_message).not.toHaveBeenCalled();
  });

  describe("malformed upstream response", () => {
    const liveSensors = [
      { source: "sensor-1", payload: { data: { network: { ip_address: "192.168.1.10" } } } },
    ];

    function mockPingerResponse(body: unknown) {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(body),
      });
    }

    function makeRes() {
      return {
        status: jest.fn().mockReturnThis(),
        contentType: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
    }

    // Each case: a 2xx response whose body does not match the expected schema
    // must degrade to live-sensors-only (like an unavailable pinger), not
    // reject the async handler (Express 4 would surface the rejection as an
    // unhandledRejection, which triggers process shutdown).
    const malformedBodies: Record<string, unknown> = {
      "an empty object": {},
      "a null devices array": { devices: null },
      "a non-array devices": { devices: "not-an-array" },
      "a device with a non-string source": { devices: [{ source: 123 }] },
      "a device missing any ip field": { devices: [{ source: "sensor-1" }] },
    };

    for (const [label, body] of Object.entries(malformedBodies)) {
      it(`should return a partial result with a warning when the pinger returns ${label}`, async () => {
        mockPingerResponse(body);

        const network = createMockNetwork(liveSensors);
        const res: any = makeRes();

        await getAnalyzeIpPinger(
          {} as express.Request,
          res,
          network,
          "http://192.168.1.4:3300",
          true,
          10_000
        );

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.contentType).toHaveBeenCalledWith("application/json");
        expect(res.send).toHaveBeenCalledWith(
          expect.objectContaining({
            warning: "ip-pinger returned an invalid configuration — analysis incomplete",
            live_sensors: liveSensors,
          })
        );
      });
    }

    it("should normalize camelCase ipAddress from current ip-pinger builds and run full analysis", async () => {
      mockPingerResponse({
        logLevel: "info",
        alwaysLogErrors: true,
        apiPort: 3300,
        intervalSecs: 60,
        devices: [
          { source: "sensor-1", ipAddress: "192.168.1.10", deviceType: "sensor" },
        ],
      });

      const network = createMockNetwork(liveSensors);
      const res: any = makeRes();

      await getAnalyzeIpPinger(
        {} as express.Request,
        res,
        network,
        "http://192.168.1.4:3300",
        true,
        10_000
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const sendArg = (res.send as jest.Mock).mock.calls[0][0];
      expect(sendArg).not.toHaveProperty("warning");
      // OK requires the sensor IP to equal the (normalized) config IP — a
      // failed normalization would surface as "IP Address Mismatch" instead.
      expect(sendArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: "OK" }),
        ])
      );
    });

    it("should use the camelCase ipAddress in mismatch results", async () => {
      mockPingerResponse({
        devices: [
          { source: "sensor-1", ipAddress: "192.168.1.99", deviceType: "sensor" },
        ],
      });

      const network = createMockNetwork(liveSensors);
      const res: any = makeRes();

      await getAnalyzeIpPinger(
        {} as express.Request,
        res,
        network,
        "http://192.168.1.4:3300",
        true,
        10_000
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const sendArg = (res.send as jest.Mock).mock.calls[0][0];
      expect(sendArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            state: "IP Address Mismatch",
            "state-value": { sensor: "192.168.1.10", config: "192.168.1.99" },
          }),
        ])
      );
    });

    it("should still accept kebab-case ip-address from older ip-pinger builds", async () => {
      mockPingerResponse({
        devices: [
          { source: "sensor-1", "ip-address": "192.168.1.10" },
        ],
      });

      const network = createMockNetwork(liveSensors);
      const res: any = makeRes();

      await getAnalyzeIpPinger(
        {} as express.Request,
        res,
        network,
        "http://192.168.1.4:3300",
        true,
        10_000
      );

      expect(res.status).toHaveBeenCalledWith(200);
      const sendArg = (res.send as jest.Mock).mock.calls[0][0];
      expect(sendArg).not.toHaveProperty("warning");
      expect(sendArg).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ state: "OK" }),
        ])
      );
    });
  });
});
