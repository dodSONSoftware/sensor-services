/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { appSettingsSchema, DEFAULT_SETTINGS, type TelemetryItem } from "../../../src/schemas/settings";
import { getSettings, isSettingKeyValid, patchSettings, validateSettingsFromDb } from "../../../src/services/settingsStore";

/**
 * Build a customized air telemetry array that contains every default value
 * (so the loader's "append missing default items" merge adds nothing) with
 * one recognizable change: the TEMP item is hidden.
 */
function customAir(): TelemetryItem[] {
    const customized = structuredClone(DEFAULT_SETTINGS.telemetry.air);
    customized[0] = { ...customized[0], visible: false };
    return customized;
}

describe("validateSettingsFromDb", () => {
    it("should restore telemetry customizations persisted in nested form", () => {
        const customWater: TelemetryItem[] = [{ ui: "TEMPERATURE", order: 0, value: "temperature_c", visible: false }];
        const data = {
            theme: "dark",
            time_range_hours: 48,
            telemetry: {
                air: customAir(),
                water: customWater,
                light: structuredClone(DEFAULT_SETTINGS.telemetry.light),
            },
        };

        const result = validateSettingsFromDb(data);

        expect(result.theme).toBe("dark");
        expect(result.time_range_hours).toBe(48);
        expect(result.telemetry.air).toEqual(customAir());
        expect(result.telemetry.water).toEqual(customWater);
        expect(result.telemetry.light).toEqual(structuredClone(DEFAULT_SETTINGS.telemetry.light));
    });

    it("should not leave literal flat telemetry keys on the result", () => {
        const result = validateSettingsFromDb({ telemetry: { air: customAir() } });

        // toHaveProperty walks dotted paths, so use `in` to check for a
        // literal top-level "telemetry.air" key specifically.
        expect("telemetry.air" in result).toBe(false);
        expect("air_telemetry" in result).toBe(false);
    });

    it("should accept string JSONB input", () => {
        const result = validateSettingsFromDb(JSON.stringify({ telemetry: { air: customAir() } }));

        expect(result.telemetry.air).toEqual(customAir());
    });

    it("should apply defaults for keys missing from persisted data", () => {
        const result = validateSettingsFromDb({});

        expect(result).toEqual(structuredClone(DEFAULT_SETTINGS));
        expect(appSettingsSchema.safeParse(result).success).toBe(true);
    });

    it("should append newly added default telemetry items to a persisted subset", () => {
        const data = {
            telemetry: { air: [{ ui: "TEMPERATURE", order: 0, value: "temperature_c", visible: true }] },
        };

        const result = validateSettingsFromDb(data);

        expect(result.telemetry.air).toEqual(structuredClone(DEFAULT_SETTINGS.telemetry.air));
    });

    it("should migrate legacy boolean theme values", () => {
        expect(validateSettingsFromDb({ theme: true }).theme).toBe("light");
        expect(validateSettingsFromDb({ theme: false }).theme).toBe("dark");
    });

    it("should migrate legacy flat telemetry aliases into nested form", () => {
        const result = validateSettingsFromDb({ air_telemetry: customAir() });

        expect(result.telemetry.air).toEqual(customAir());
        expect(result).not.toHaveProperty("air_telemetry");
    });

    it("should produce a result that passes the canonical schema", () => {
        const result = validateSettingsFromDb({ theme: "dark", telemetry: { air: customAir() } });

        expect(appSettingsSchema.safeParse(result).success).toBe(true);
    });

    it("should throw for invalid persisted values", () => {
        expect(() => validateSettingsFromDb({ telemetry: { air: "not-an-array" } })).toThrow();
        expect(() => validateSettingsFromDb({ time_range_hours: 0 })).toThrow();
        expect(() => validateSettingsFromDb({ theme: "neon" })).toThrow();
        expect(() => validateSettingsFromDb(null)).toThrow();
    });

    it("should not mutate DEFAULT_SETTINGS", () => {
        const before = structuredClone(DEFAULT_SETTINGS);

        validateSettingsFromDb({ telemetry: { air: customAir() } });

        expect(DEFAULT_SETTINGS).toEqual(before);
    });
});

describe("isSettingKeyValid", () => {
    it("should accept flat keys present in DEFAULT_SETTINGS", () => {
        expect(isSettingKeyValid("theme")).toBe(true);
        expect(isSettingKeyValid("time_range_hours")).toBe(true);
        expect(isSettingKeyValid("unit_system")).toBe(true);
    });

    it("should accept nested dot-notation keys under the telemetry parent", () => {
        expect(isSettingKeyValid("telemetry.air")).toBe(true);
        expect(isSettingKeyValid("telemetry.water")).toBe(true);
        expect(isSettingKeyValid("telemetry.light")).toBe(true);
    });

    it("should reject unknown flat and nested keys", () => {
        expect(isSettingKeyValid("nope")).toBe(false);
        expect(isSettingKeyValid("telemetry.nope")).toBe(false);
        expect(isSettingKeyValid("telemetry.air.extra")).toBe(false);
    });

    it("should reject reserved prototype-chain keys in every segment", () => {
        // These are present on every object via `in`, but are not own
        // settings — assigning any of them would touch the prototype chain.
        for (const reserved of ["__proto__", "constructor", "prototype"]) {
            expect(isSettingKeyValid(reserved)).toBe(false);
            expect(isSettingKeyValid(`telemetry.${reserved}`)).toBe(false);
            expect(isSettingKeyValid(`${reserved}.air`)).toBe(false);
            expect(isSettingKeyValid(`telemetry.${reserved}.x`)).toBe(false);
        }
    });

    it("should reject keys that only exist on the prototype chain", () => {
        // `in` would report these on any object; own-property checks must not.
        expect(isSettingKeyValid("toString")).toBe(false);
        expect(isSettingKeyValid("hasOwnProperty")).toBe(false);
        expect(isSettingKeyValid("valueOf")).toBe(false);
    });
});

describe("patchSettings reserved-key guard", () => {
    it("should drop reserved keys without rewriting any prototype", async () => {
        const poisoned = { marker: "pwned" };
        const before = getSettings();

        const after = await patchSettings({
            __proto__: poisoned,
            constructor: poisoned,
            prototype: poisoned,
            "telemetry.__proto__": poisoned,
        });

        // Reserved keys are dropped like any unknown key: settings unchanged.
        expect(after).toEqual(structuredClone(before));
        // Neither the cache nor the nested telemetry object had its prototype
        // rewritten by a `["__proto__"] = value` assignment (prototype-chain
        // members like `constructor` and `marker` are untouched).
        for (const obj of [after, after.telemetry]) {
            const proto = Object.getPrototypeOf(obj) as Record<PropertyKey, unknown>;
            expect(proto).not.toBe(poisoned);
            expect("marker" in proto).toBe(false);
            expect(proto["constructor"]).not.toBe(poisoned);
        }
    });
});

/**
 * Persistence round-trip: the exact JSON that patchSettings() would write to
 * PostgreSQL must reload with the telemetry customization intact.
 */
describe("settings persistence round-trip", () => {
    it("should keep a patched telemetry array after reloading the persisted JSON", async () => {
        const customized = customAir();

        // patchSettings without init() stores in memory only, but the returned
        // object is exactly what JSON.stringify(newCache) would persist to the DB.
        const patched = await patchSettings({ "telemetry.air": customized });
        expect(patched.telemetry.air).toEqual(customized);
        const dbJson = JSON.stringify(patched);

        // Simulate a restart: reinitialize the store from that exact JSON.
        const reloaded = validateSettingsFromDb(dbJson);

        expect(reloaded.telemetry.air).toEqual(customized);
        expect("telemetry.air" in reloaded).toBe(false);
        expect(appSettingsSchema.safeParse(reloaded).success).toBe(true);
    });
});
