/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { analyzeIt, createAnalyzeResult, getAbout, getAnalyzeIpPinger, getPing, postWriteConfig } from "../../../src/controllers/pingerController";
import type { MqttNetworking } from "../../../src/dodsonlabs/MqttNetworking";
import type express from "express";

// Mock AbortSignal.timeout so tests don't hang on real timers.
// Returns a signal that never fires (aborts only if explicitly aborted).
const _neverAbortSignal = new AbortController().signal;
beforeAll(() => {
  jest.spyOn(AbortSignal, "timeout").mockImplementation((_ms: number) => _neverAbortSignal);
});
afterAll(() => {
  jest.restoreAllMocks();
});

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
        { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
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
        { source: "sensor-1", payload: { "ip-address": "192.168.1.99" } },
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
        { source: "sensor-new", payload: { "ip-address": "192.168.1.50" } },
      ];
      const ippingerDevices: Record<string, any>[] = [];

      const results = analyzeIt(liveSensors, ippingerDevices, true);

      expect(results).toHaveLength(1);
      expect(results[0]["state"]).toBe("New");
    });

    it("should return Name Mismatch when IP matches but source differs", () => {
      const liveSensors = [
        { source: "different-name", payload: { "ip-address": "192.168.1.10" } },
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
        { source: "Sensor-1", payload: { "ip-address": "192.168.1.10" } },
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
        { source: "Different-Name", payload: { "ip-address": "192.168.1.10" } },
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
      { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
      { source: "sensor-2", payload: { "ip-address": "192.168.1.20" } },
      { source: "sensor-new", payload: { "ip-address": "192.168.1.30" } },
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
    
    mqtt_topic_command: "iot/v2/command",
    mqtt_topic_command_response: "iot/v2/command-response",
    is_connected: jest.fn().mockReturnValue(true),
    prometheus_server_ready: jest.fn().mockReturnValue(true),
    publish_mqtt_message: jest.fn(),
    close: jest.fn(),
    get_cr_dude: jest.fn().mockReturnValue({
      is_running: false,
      is_timed_out: true,
      timeout: null,
      results: liveResults,
      initialize: jest.fn(),
      deinitialize: jest.fn(),
      clear_results: jest.fn(),
      restart_clock: jest.fn(),
      cancel_clock: jest.fn(),
      // Return an already-resolved promise so mqtt_command_wait_for_command_completion
      // skips the hard-timeout setTimeout entirely.
      waitForCompletion: jest.fn().mockImplementation(() => Promise.resolve()),
    }),
    register_command_id: jest.fn().mockReturnValue(true),
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
      { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
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
        live_sensors: [{ source: "sensor-1", payload: { "ip-address": "192.168.1.10" } }],
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
      { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
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
});

// **** fetchIt / postIt / fetchItOnly non-OK response branches

describe("fetchIt non-OK response", () => {
  it("should return 502 when fetchIt receives a non-OK response", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const res = createMockRes();

    await getAbout(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.contentType).toHaveBeenCalledWith("application/json");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "upstream error: 503 Service Unavailable",
      })
    );
  });
});

describe("fetchIt timeout", () => {
  it("should return 502 when fetch times out", async () => {
    // Restore real AbortSignal.timeout so the signal actually fires.
    jest.restoreAllMocks();

    const mockFetch = globalThis.fetch as jest.Mock;
    // Simulate a hanging fetch that never resolves on its own,
    // but does reject when the AbortSignal fires.
    mockFetch.mockImplementation((_url, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("The operation was aborted"));
        }, { once: true });
      });
    });

    const res = createMockRes();

    await getAbout(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      50  // 50ms timeout for fast test
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.contentType).toHaveBeenCalledWith("application/json");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "upstream unavailable",
      })
    );

    // Re-apply the mock for subsequent tests.
    jest.spyOn(AbortSignal, "timeout").mockImplementation((_ms: number) => _neverAbortSignal);
  });
});

describe("postIt non-OK response", () => {
  it("should return 502 when postIt receives a non-OK response", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    const res = createMockRes();

    await postWriteConfig(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      { key: "value" },
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.contentType).toHaveBeenCalledWith("application/json");
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "upstream unavailable",
      })
    );
  });
});

describe("fetchItOnly non-OK response", () => {
  it("should return warning when fetchItOnly receives a non-OK response", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });

    const network = createMockNetwork([
      { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
    ]);

    const res = createMockRes();

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
        live_sensors: [{ source: "sensor-1", payload: { "ip-address": "192.168.1.10" } }],
      })
    );
  });

  it("should call clear_results even when analyzeIt throws", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        devices: "not-an-array", // invalid shape — analyzeIt will throw
      }),
    });

    const network = createMockNetwork([
      { source: "sensor-1", payload: { "ip-address": "192.168.1.10" } },
    ]);

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await expect(
      getAnalyzeIpPinger(
        {} as express.Request,
        res,
        network,
        "http://192.168.1.4:3300",
        true,
        10_000
      )
    ).rejects.toThrow();

    // clear_results must be called even on error path
    expect(network.get_cr_dude("identify")!.clear_results).toHaveBeenCalled();
  });
});

// **** getPing IP validation

describe("getPing IP validation", () => {
  beforeEach(() => {
    (globalThis.fetch as jest.Mock) = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should forward valid public IP to upstream", async () => {
    const mockFetch = globalThis.fetch as jest.Mock;
    mockFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: "ok" }),
    });

    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "8.8.8.8",
      10_000
    );

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockFetch).toHaveBeenCalledWith("http://192.168.1.4:3300/ping/8.8.8.8", expect.anything());
  });

  it("should reject empty string", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("non-empty") })
    );
  });

  it("should reject non-IPv4 strings", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "not-an-ip",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("IPv4") })
    );
  });

  it("should reject out-of-range octets", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "999.999.999.999",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("out of range") })
    );
  });

  it("should accept private 127.0.0.1 and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "127.0.0.1",
      10_000
    );

    // IP is now accepted (private IPs are valid targets for internal IoT networks)
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("should accept private 169.254.169.254 and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "169.254.169.254",
      10_000
    );

    // IP is now accepted
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("should reject path traversal attempts", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "../../etc/passwd",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringMatching(/invalid characters|IPv4/) })
    );
  });

  it("should reject URL-encoded SSRF payloads", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "127.0.0.1%2F..%2Fetc%2Fpasswd",
      10_000
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("invalid characters") })
    );
  });

  it("should accept private 10.x.x.x addresses and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "10.0.0.1",
      10_000
    );

    // IP is now accepted (private IPs are valid targets for internal IoT networks)
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("should accept private 172.16-31.x.x addresses and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "172.16.0.1",
      10_000
    );

    // IP is now accepted
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("should accept private 192.168.x.x addresses and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "192.168.1.100",
      10_000
    );

    // IP is now accepted
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("should accept multicast 224.x.x.x addresses and proxy the request", async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      contentType: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await getPing(
      {} as express.Request,
      res,
      "http://192.168.1.4:3300",
      "224.0.0.1",
      10_000
    );

    // IP is now accepted
    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(res.status).toHaveBeenCalledWith(502);
  });
});
