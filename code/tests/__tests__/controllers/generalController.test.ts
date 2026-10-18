/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { Request, Response } from "express";
import { getAbout, getDateCurrent, getDateUTC, getEndpoints, getHealth } from "../../../src/controllers/generalController";
import { createMockRes, createMockReq } from "../../mocks/express";
import { setConfig } from "../../../src/common/global";
import { HEALTH_PROBE_TTL_MS, resetHealthProbeCache } from "../../../src/common/healthProbeCache";
import { APP_NAME } from "../../../src/version";

// Mock settingsStore so tests don't require a real DB connection. Only
// isPersistenceAvailable is exercised here (the /health probe); the other
// exports exist because settingsController, loaded via the __routesHelp
// imports, pulls them from the same module.
jest.mock("../../../src/services/settingsStore", () => ({
  getSettings: jest.fn(() => ({})),
  patchSettings: jest.fn(async () => ({})),
  isPersistenceAvailable: jest.fn(() => mockPersistenceAvailable),
}));

// P2-1: controllable so tests can exercise both the persisted (true) and
// degraded in-memory (false) branches of /health.
let mockPersistenceAvailable = true;

/**
 * Create a mock fetch response that resolves with a successful HTTP response.
 */
function createMockFetchResponse(status: string = "healthy"): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ status }),
    text: jest.fn().mockResolvedValue(""),
    headers: new Headers(),
    redirected: false,
    statusText: "OK",
    url: "",
    clone: jest.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    blob: jest.fn().mockResolvedValue(new Blob()),
    formData: jest.fn().mockResolvedValue(new FormData()),
    bytes: jest.fn().mockResolvedValue(new Uint8Array()),
  } as Response;
}

afterEach(() => {
  // Restore original fetch after each test
  jest.restoreAllMocks();
  // Clear config after each test
  setConfig(undefined);
  // The dependency probe cache is module-level: clear it so one test's
  // probe results cannot be served to the next test
  resetHealthProbeCache();
});

describe("getAbout", () => {
  it("should return IAbout JSON with OK status", async () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    await getAbout(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("about");
    expect(body.about).toHaveProperty("name");
    expect(body.about).toHaveProperty("version");
    expect((body.about as Record<string, unknown>).release).toBe(APP_NAME);
    expect(body.system).toHaveProperty("status");
    expect(body.system).toHaveProperty("mqtt");
    expect(body.system).toHaveProperty("ipPinger");
    expect(body.system).toHaveProperty("sensorTelemetry");
    expect(body.system).toHaveProperty("bootdate");
  });
});

describe("getDateCurrent", () => {
  it("should return a formatted local date string", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    getDateCurrent(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("text/plain");
    expect(sendCalls).toHaveLength(1);
    const dateStr = sendCalls[0] as string;
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });

  // Regression: Date#getMonth() is zero-based (January = 0); the formatter
  // must emit one-based calendar months. Assert the exact complete response.
  describe("with frozen time", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return January as month 01, not 00", () => {
      jest.useFakeTimers();
      // Local-time construction keeps the assertion TZ-independent
      jest.setSystemTime(new Date(2026, 0, 15, 12, 34, 56));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-01-15T12:34:56");
    });

    it("should return October as month 10, not 09", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 9, 3, 0, 5, 9));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-10-03T00:05:09");
    });

    it("should return December 31 as month 12", () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));

      const { res, sendCalls } = createMockRes();
      getDateCurrent(createMockReq() as Request, res as Response);

      expect(sendCalls[0]).toBe("2026-12-31T23:59:59");
    });
  });
});

describe("getDateUTC", () => {
  it("should return a formatted UTC date string", () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    getDateUTC(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("text/plain");
    expect(sendCalls).toHaveLength(1);
    const dateStr = sendCalls[0] as string;
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

describe("getHealth", () => {
  beforeEach(() => {
    // Default to the persisted branch; individual tests flip it
    mockPersistenceAvailable = true;
    // Set up a minimal config for health checks
    setConfig({
      "log-level": "debug",
      "express-port": 32000,
      "mqtt-broker-ip-address": "10.10.10.64",
      "mqtt-topic-command": "iot/v2/command",
      "mqtt-topic-command-response": "iot/v2/command-response",
      "ip-pinger-web-api": "http://10.10.10.64:32001",
      "case-sensitive": true,
      "db-host": "localhost",
      "db-port": 5432,
      "db-name": "sensor_db",
      "db-user": "sensor_user",
      "db-password": "sensor_pass",
    });
  });

  it("should return health object with MQTT check when connected", async () => {
    const { res, statusCalls, contentTypeCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Mock successful responses for both IP Pinger and Sensor Telemetry
    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    expect(contentTypeCalls).toContain("application/json");
    expect(sendCalls).toHaveLength(1);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body).toHaveProperty("status");
    expect(body.status).toBe("healthy");
    expect(body).toHaveProperty("mqtt");
    expect(body.mqtt).toBe("connected");
    expect(body).toHaveProperty("ipPinger");
    expect(body.ipPinger).toBe("healthy");
    expect(body).toHaveProperty("sensorTelemetry");
    expect(body.sensorTelemetry).toBe("healthy");
    expect(body.settingsPersistence).toBe("healthy");
    expect(body).toHaveProperty("timestamp");
  });

  // P2-1: settings persistence loss is a degraded capability, not a service
  // failure — the app deliberately runs in in-memory (non-durable) mode when
  // PostgreSQL is unavailable, so it must map to degraded + HTTP 200, never
  // unhealthy + 503.

  it("P2-1: reports degraded with HTTP 200 when settings persistence is unavailable", async () => {
    mockPersistenceAvailable = false;
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("connected");
    expect(body.ipPinger).toBe("healthy");
    expect(body.sensorTelemetry).toBe("healthy");
    expect(body.settingsPersistence).toBe("unavailable");
  });

  it("P2-1: allows a fully healthy status when persistence is available and everything else is up", async () => {
    mockPersistenceAvailable = true;
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    expect(statusCalls).toContain(200);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("healthy");
    expect(body.settingsPersistence).toBe("healthy");
  });

  it("P2-1: MQTT disconnect remains unhealthy even when persistence is unavailable", async () => {
    mockPersistenceAvailable = false;
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
    }) as Request & { mqtt_connected: boolean };

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("unhealthy");
    expect(body.mqtt).toBe("disconnected");
    expect(body.settingsPersistence).toBe("unavailable");
  });

  it("should report unhealthy status with HTTP 503 when mqtt is not connected", async () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: false,
    }) as Request & { mqtt_connected: boolean };

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    // Unhealthy must surface to orchestration: curl -f healthchecks only
    // fail on HTTP error status codes
    expect(statusCalls).toContain(503);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("unhealthy");
    expect(body.mqtt).toBe("disconnected");
    expect(body.ipPinger).toBe("healthy");
    expect(body.sensorTelemetry).toBe("healthy");
  });

  it("should mark ipPinger as unreachable when fetch fails", async () => {
    const { res, statusCalls, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Use separate mock implementations for each call
    // IP Pinger (/health) fails, telemetry (/health) succeeds
    const mockFetch = jest.fn();
    mockFetch.mockImplementationOnce((url: string) => {
      if (url.includes("/health")) {
        return Promise.reject(new Error("IP Pinger unavailable"));
      }
      return Promise.resolve(createMockFetchResponse());
    });

    jest.spyOn(global, "fetch").mockImplementation(mockFetch);

    await getHealth(req, res as Response);

    // Degraded stays HTTP 200 — non-critical dependency failures are visible
    // in the body without failing the container healthcheck
    expect(statusCalls).toContain(200);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.status).toBe("degraded");
    expect(body.mqtt).toBe("connected");
    expect(body.ipPinger).toBe("unreachable");
    expect(body.sensorTelemetry).toBe("healthy");
  });

  it("P2-3: a wedged dependency cannot push /health past Docker's 5s deadline", async () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Simulate a dependency that accepts the connection but never responds:
    // the mock rejects ONLY when the AbortSignal aborts, so the only thing that
    // can end the wait is HEALTH_CHECK_TIMEOUT_MS. If that timeout were (still)
    // ~5000ms, this test would take ~5s and fail the < 4000ms bound below.
    const mockFetch = jest.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = opts?.signal;
        if (!signal) {
          return; // never settles — should be aborted by the timeout
        }
        signal.addEventListener(
          "abort",
          () => reject(new Error("health probe timed out")),
          { once: true }
        );
      });
    });
    jest.spyOn(global, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    const start = Date.now();
    await getHealth(req, res as Response);
    const elapsed = Date.now() - start;

    // Well under Docker's 5s healthcheck --timeout (with margin), and the
    // wedged dependency is reported as unreachable (degraded), not fatal.
    expect(elapsed).toBeLessThan(4000);
    const body = sendCalls[0] as Record<string, unknown>;
    expect(body.ipPinger).toBe("unreachable");
    expect(body.status).toBe("degraded");
  });

  it("should handle missing config gracefully", async () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq({
      mqtt_connected: true,
    }) as Request & { mqtt_connected: boolean };

    // Clear config
    setConfig(undefined);

    jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());

    await getHealth(req, res as Response);

    const body = sendCalls[0] as Record<string, unknown>;
    // When config is missing, health checks are skipped (default to healthy)
    expect(body.status).toBe("healthy");
    expect(body.mqtt).toBe("connected");
    expect(body.ipPinger).toBe("healthy");
    expect(body.sensorTelemetry).toBe("healthy");
  });
});

describe("dependency probe cache (short TTL)", () => {
  // The /health endpoint is rate-limit-exempt, so an unthrottled client must
  // not be able to fire a full bounded probe per request — results (including
  // failures) are served from a short shared TTL cache.
  beforeEach(() => {
    mockPersistenceAvailable = true;
    setConfig({
      "log-level": "debug",
      "express-port": 32000,
      "mqtt-broker-ip-address": "10.10.10.64",
      "mqtt-topic-command": "iot/v2/command",
      "mqtt-topic-command-response": "iot/v2/command-response",
      "ip-pinger-web-api": "http://10.10.10.64:32001",
      "sensor-telemetry-api": "http://10.10.10.64:32002",
      "case-sensitive": true,
      "db-host": "localhost",
      "db-port": 5432,
      "db-name": "sensor_db",
      "db-user": "sensor_user",
      "db-password": "sensor_pass",
    });
  });

  it("serves a second /health call within the TTL from the cache (one probe per dependency)", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());
    const req = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res1 } = createMockRes();
    const { res: res2 } = createMockRes();

    await getHealth(req, res1 as Response);
    await getHealth(req, res2 as Response);

    // Two fetches total (one per dependency), not four
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-probes after the TTL expires", async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());
    const req = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res1 } = createMockRes();
    const { res: res2 } = createMockRes();

    await getHealth(req, res1 as Response);
    jest.advanceTimersByTime(HEALTH_PROBE_TTL_MS + 1);
    await getHealth(req, res2 as Response);

    // Fresh probe for each dependency after expiry: two more fetches
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("caches a failed probe result (a dead dependency does not re-probe within the TTL)", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 503 } as Response);
    const req = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res1, sendCalls: calls1 } = createMockRes();
    const { res: res2, sendCalls: calls2 } = createMockRes();

    await getHealth(req, res1 as Response);
    await getHealth(req, res2 as Response);

    // Both responses reflect the cached failure...
    expect((calls1[0] as Record<string, unknown>).status).toBe("degraded");
    expect((calls2[0] as Record<string, unknown>).status).toBe("degraded");
    // ...and the second call issued no additional fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares the cache between /health and /about", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(createMockFetchResponse());
    const reqHealth = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res1 } = createMockRes();
    await getHealth(reqHealth, res1 as Response);

    const reqAbout = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res2, sendCalls: aboutCalls } = createMockRes();
    await getAbout(reqAbout, res2 as Response);

    // /about reuses the /health probe results — no additional fetches
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const about = aboutCalls[0] as { system: { ipPinger: string; sensorTelemetry: string } };
    expect(about.system.ipPinger).toBe("healthy");
    expect(about.system.sensorTelemetry).toBe("healthy");
  });

  it("does not double-fire concurrent probes while one is in flight", async () => {
    let resolvers: ((r: Response) => void)[] = [];
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(
      () => new Promise<Response>((resolve) => resolvers.push(resolve))
    );
    const req = createMockReq({ mqtt_connected: true }) as Request & { mqtt_connected: boolean };
    const { res: res1 } = createMockRes();
    const { res: res2 } = createMockRes();

    const [h1, h2] = [getHealth(req, res1 as Response), getHealth(req, res2 as Response)];
    // The second call arrived while the first's probes were still in flight:
    // exactly one fetch per dependency, not two
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers.forEach((resolve) => resolve(createMockFetchResponse()));
    await Promise.all([h1, h2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getEndpoints", () => {
  // P3-1: the /endpoints discovery metadata must match the handlers — the
  // deprecated update-config route must advertise its 501 contract (not a
  // working partial update), and the reboot routes must describe the real
  // command-result array (not a { success, message } object).
  function getEndpoint(route: string): Record<string, unknown> {
    const { res, sendCalls } = createMockRes();
    getEndpoints(createMockReq() as Request, res as Response);
    const body = sendCalls[0] as { endpoints: Record<string, unknown>[] };
    const entry = body.endpoints.find((e) => e["route"] === route);
    expect(entry).toBeDefined();
    return entry as Record<string, unknown>;
  }

  it("marks update-config deprecated/unsupported with 501 and the write-config replacement", () => {
    const updateConfig = getEndpoint("/sensors/update-config/:source");
    expect(String(updateConfig["description"])).toMatch(/deprecated/i);
    expect(String(updateConfig["description"])).toMatch(/501/);
    expect(String(updateConfig["description"])).toMatch(/write-config/);
    // Must not advertise a partial-update success object or request body
    expect(String(updateConfig["responseBody"])).not.toMatch(/success:\s*boolean/i);
    expect(String(updateConfig["requestBody"])).not.toMatch(/partial/i);
  });

  it("describes the reboot endpoints as a command-result array (not success/message)", () => {
    const rebootAll = getEndpoint("/sensors/reboot");
    const rebootSingle = getEndpoint("/sensors/reboot/:source");
    for (const entry of [rebootAll, rebootSingle]) {
      expect(String(entry["responseBody"])).toMatch(/array/i);
      expect(String(entry["responseBody"])).toMatch(/command_metadata/);
      expect(String(entry["responseBody"])).not.toMatch(/success:\s*boolean/i);
    }
  });

  it("describes the config endpoints as persisted vs in-memory", () => {
    const readConfig = getEndpoint("/api/read-config");
    expect(String(readConfig["description"])).toMatch(/persisted/);
    const readRunningConfig = getEndpoint("/api/read-running-config");
    expect(String(readRunningConfig["description"])).toMatch(/in-memory/);
  });

  it("describes /restart-service as POST, token-gated, and body-ignored", () => {
    const entry = getEndpoint("/restart-service");
    expect(String(entry["verb"])).toBe("POST");
    expect(String(entry["requestBody"])).toMatch(/never consumed/i);
    expect(String(entry["description"])).toMatch(/RESTART_SERVICE_TOKEN/);
    expect(String(entry["description"])).toMatch(/fail-closed/i);
    // The full status ladder is advertised so clients can script against it
    expect(String(entry["description"])).toMatch(/401/);
    expect(String(entry["description"])).toMatch(/409/);
    expect(String(entry["description"])).toMatch(/503/);
  });
});

describe("getAbout route advertisement", () => {
  it("lists the Restart command module (stays advertised while the endpoint is disabled)", async () => {
    const { res, sendCalls } = createMockRes();
    const req = createMockReq() as Request;

    await getAbout(req, res as Response);

    const body = sendCalls[0] as { routes: { name: string; help: Record<string, unknown> }[] };
    const restart = body.routes.find((r) => r.name === "Restart");
    expect(restart).toBeDefined();
    const commands = restart!.help["commands"] as { route: string }[];
    expect(commands.map((c) => c.route)).toEqual(["/restart-service"]);
  });
});
