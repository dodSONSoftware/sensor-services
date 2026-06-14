name: prometheus-cardinality-fix
description: Fix unbounded Prometheus gauge label cardinality via configurable source sanitization
metadata:
  type: project

**Issue:** Unbounded Prometheus gauge label cardinality via arbitrary `source` names from MQTT telemetry.

**Fix:** Added `sanitizeSource()` method to `PrometheusWriter.ts` that:
- Strips invalid characters (keeps only configured valid chars)
- Truncates to configurable max length (default: 30 chars)
- Logs debug when sanitization changes the source

**Configurable options:**
- `prometheus-max-source-length`: Maximum label length (default: 30)
- `prometheus-valid-source-chars`: Character whitelist (default: `a-zA-Z0-9._-`)

**Changes:**
- Added `MAX_SOURCE_LENGTH` and `VALID_CHARS` as configurable properties in `PrometheusWriter`
- Added `sanitizeSource(source: string): string` private method after constructor
- Updated all 7 publish methods (`publish_air`, `publish_light`, `publish_rain`, `publish_wind`, `publish_water`, `publish_lightning`) to call `sanitizeSource()` before using the source value
- Removed template literal `${source}` in gauge `.set()` calls to avoid double-escaping
- Added config keys to `src/schemas/config.ts`

**Impact:** Prevents DoS via unbounded label cardinality while preserving legitimate sensor names.

**Build verified:** `npm run build` succeeds.

**Related:** [[prometheus-security-hardening]]
