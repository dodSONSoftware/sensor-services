#!/usr/bin/env node
/*
 * Smoke-test driver for sensor-web-services.
 * Launched by the run-sensor-web-services skill.
 * All paths relative to <unit>/ (repo root).
 */

const BASE = process.env.API_BASE || "http://localhost:32000";
const PROM_BASE = process.env.PROM_BASE || "http://localhost:3301";
const TIMEOUT_MS = 8000;

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    return { status: res.status, body: text };
  } finally {
    clearTimeout(tid);
  }
}

async function main() {
  // Wait for the server to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetchJson(`${BASE}/health`);
      if (r.status === 200) { ready = true; break; }
    } catch { /* server not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    console.error("ERROR: server did not become ready in 10s");
    process.exit(1);
  }

  const results = [];
  let failures = 0;

  // General endpoints
  const general = ["/about", "/date_local", "/date_utc", "/health"];
  for (const path of general) {
    const r = await fetchJson(`${BASE}${path}`);
    const ok = r.status === 200;
    if (!ok) failures++;
    results.push(`${ok ? "OK" : "FAIL"} ${path} → ${r.status}`);
  }

  // Sensor endpoints (return [] when no MQTT sensors — still 200)
  const sensors = ["/sensors/identify", "/sensors/get-details"];
  for (const path of sensors) {
    const r = await fetchJson(`${BASE}${path}`);
    const ok = r.status === 200;
    if (!ok) failures++;
    results.push(`${ok ? "OK" : "FAIL"} ${path} → ${r.status}`);
  }

  // Pinger proxy endpoints
  const pinger = ["/ippinger/about", "/ippinger/read-config"];
  for (const path of pinger) {
    const r = await fetchJson(`${BASE}${path}`);
    const ok = r.status === 200;
    if (!ok) failures++;
    results.push(`${ok ? "OK" : "FAIL"} ${path} → ${r.status}`);
  }

  // Prometheus metrics
  const m = await fetchJson(`${PROM_BASE}/metrics`);
  const metricsOk = m.status === 200 && m.body.includes("Air_Temperature");
  if (!metricsOk) failures++;
  results.push(`${metricsOk ? "OK" : "FAIL"} /metrics → ${m.status} (${metricsOk ? "has gauges" : "empty/wrong"})`);

  // API-specific metrics
  const a = await fetchJson(`${BASE}/metrics/api`);
  const apiMetricsOk = a.status === 200 && a.body.includes("http_requests_total");
  if (!apiMetricsOk) failures++;
  results.push(`${apiMetricsOk ? "OK" : "FAIL"} /metrics/api → ${apiMetricsOk ? "has counters" : "empty/wrong"}`);

  // Swagger
  const sw = await fetchJson(`${BASE}/swagger`, { redirect: "follow" });
  const swOk = sw.status === 200 && sw.body.length > 100;
  if (!swOk) failures++;
  results.push(`${swOk ? "OK" : "FAIL"} /swagger → ${sw.status} (${swOk ? "served" : "broken"})`);

  // Print results
  console.log("\n=== sensor-web-services smoke test ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Driver error:", err.message);
  process.exit(1);
});
