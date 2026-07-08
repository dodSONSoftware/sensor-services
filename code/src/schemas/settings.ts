/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { z } from "zod";

/**
 * UI preferences for the Angular dashboard.
 */
export const uiPreferencesSchema = z.object({
    theme: z.boolean().default(true),
    dashboard_layout: z.enum(["cards", "list"]).default("cards"),
    notification_level: z.enum(["none", "warn", "critical"]).default("warn"),
    time_range_hours: z.number().int().positive().min(1).max(720).default(24),
    decimal_places: z.number().int().min(0).max(4).default(2),
    ping_attempts: z.number().int().min(3).max(10).default(3),
    ping_delay_ms: z.number().int().min(100).max(5000).default(500),
    recent_ips_max: z.number().int().min(5).max(20).default(10),
    unit_system: z.enum(["Metric", "Imperial"]).default("Imperial"),
});

/**
 * Server connection details that the Angular app needs to know.
 */
export const serverConfigSchema = z.object({
    mqtt_broker_address: z.string().optional(),
    mqtt_topic_telemetry: z.string().optional(),
    mqtt_topic_command: z.string().optional(),
    mqtt_topic_command_response: z.string().optional(),
});

/**
 * Telemetry item definition for display configuration.
 */
const telemetryItemSchema = z.object({
    value: z.string(),        // The raw key from sensor data (e.g., "temperature-c")
    visible: z.boolean(),     // Whether to display this value
    ui: z.string(),           // Label to show in the UI (e.g., "Temperature")
    order: z.number().int().min(0).default(0),  // Order position for sorting (lower numbers appear first)
});

/**
 * Combined telemetry settings for each sensor type.
 * Each setting defines which telemetry fields to show, their order, and UI labels.
 */
export const telemetrySettingsSchema = z.object({
    // Air sensor telemetry settings
    air_telemetry: z.array(telemetryItemSchema).default([
        { value: "temperature-c", visible: true, ui: "TEMPERATURE", order: 0 },
        { value: "humidity-percent", visible: true, ui: "HUMIDITY %", order: 1 },
        { value: "dew-point", visible: true, ui: "DEW POINT", order: 2 },
        { value: "feels-like-c", visible: true, ui: "FEELS LIKE", order: 3 },
        { value: "pressure-pascal", visible: true, ui: "PRESSURE", order: 4 },
        { value: "altitude-meters", visible: true, ui: "ALTITUDE", order: 5 },
    ]),

    // Water sensor telemetry settings
    water_telemetry: z.array(telemetryItemSchema).default([
        { value: "temperature-c", visible: true, ui: "TEMPERATURE", order: 0 },
    ]),

    // Light sensor telemetry settings
    light_telemetry: z.array(telemetryItemSchema).default([
        { value: "raw-ambient-light", visible: true, ui: "RAW AMBIENT LIGHT", order: 0 },
        { value: "raw-uv-light", visible: true, ui: "RAW UV LIGHT", order: 1 },
        { value: "lux", visible: true, ui: "LUX", order: 2 },
        { value: "uv-index", visible: true, ui: "UV INDEX", order: 3 },
    ]),
});

/**
 * Schema for partial updates - no defaults, all fields optional.
 * Used when receiving PATCH requests where only changed fields should be applied.
 */
export const appSettingsUpdateSchema = z.object({
    theme: z.boolean().optional(),
    dashboard_layout: z.enum(["cards", "list"]).optional(),
    notification_level: z.enum(["none", "warn", "critical"]).optional(),
    time_range_hours: z.number().int().positive().min(1).max(720).optional(),
    decimal_places: z.number().int().min(0).max(4).optional(),
    ping_attempts: z.number().int().min(3).max(10).optional(),
    ping_delay_ms: z.number().int().min(100).max(5000).optional(),
    recent_ips_max: z.number().int().min(5).max(20).optional(),
    unit_system: z.enum(["Metric", "Imperial"]).optional(),
    mqtt_broker_address: z.string().optional(),
    mqtt_topic_telemetry: z.string().optional(),
    mqtt_topic_command: z.string().optional(),
    mqtt_topic_command_response: z.string().optional(),

    // Telemetry settings
    air_telemetry: z.array(telemetryItemSchema).optional(),
    water_telemetry: z.array(telemetryItemSchema).optional(),
    light_telemetry: z.array(telemetryItemSchema).optional(),
});

/**
 * Combined application settings schema with defaults for partial updates.
 */
export const appSettingsSchema = uiPreferencesSchema.merge(serverConfigSchema).merge(telemetrySettingsSchema);

export type UiPreferences = z.infer<typeof uiPreferencesSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type TelemetryItem = z.infer<typeof telemetryItemSchema>;
export type TelemetrySettings = z.infer<typeof telemetrySettingsSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;

/**
 * Default settings values — used to fill in missing keys during partial updates.
 */
export const DEFAULT_SETTINGS: AppSettings = {
    theme: true,
    dashboard_layout: "cards",
    notification_level: "warn",
    time_range_hours: 24,
    decimal_places: 2,
    ping_attempts: 3,
    ping_delay_ms: 500,
    recent_ips_max: 10,
    unit_system: "Imperial",

    // Telemetry settings
    air_telemetry: [
        { value: "temperature-c", visible: true, ui: "TEMPERATURE", order: 0 },
        { value: "humidity-percent", visible: true, ui: "HUMIDITY %", order: 1 },
        { value: "dew-point", visible: true, ui: "DEW POINT", order: 2 },
        { value: "feels-like-c", visible: true, ui: "FEELS LIKE", order: 3 },
        { value: "pressure-pascal", visible: true, ui: "PRESSURE", order: 4 },
        { value: "altitude-meters", visible: true, ui: "ALTITUDE", order: 5 },
    ],

    water_telemetry: [
        { value: "temperature-c", visible: true, ui: "TEMPERATURE", order: 0 },
    ],

    light_telemetry: [
        { value: "raw-ambient-light", visible: true, ui: "RAW AMBIENT LIGHT", order: 0 },
        { value: "raw-uv-light", visible: true, ui: "RAW UV LIGHT", order: 1 },
        { value: "lux", visible: true, ui: "LUX", order: 2 },
        { value: "uv-index", visible: true, ui: "UV INDEX", order: 3 },
    ],
} as const;

/**
 * Schema metadata for each setting — used by the frontend to discover available settings,
 * their types, valid ranges/enums, and defaults. Enables dynamic form generation without
 * hardcoding field definitions in the Angular app.
 */
export const SETTINGS_SCHEMA: Record<string, {
    label: string;
    description: string;
    type: "string" | "number" | "boolean" | "enum" | "array";
    default: unknown;
    optional?: boolean;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
}> = {
    theme: {
        label: "Theme",
        description: "Dashboard color scheme (true = light, false = dark).",
        type: "boolean",
        default: true,
    },
    dashboard_layout: {
        label: "Dashboard Layout",
        description: "How sensor cards are arranged on the dashboard.",
        type: "enum",
        default: "cards",
        options: ["cards", "list"],
    },
    notification_level: {
        label: "Notification Level",
        description: "Minimum severity level that triggers alerts.",
        type: "enum",
        default: "warn",
        options: ["none", "warn", "critical"],
    },
    time_range_hours: {
        label: "Time Range (hours)",
        description: "How far back the charts display. Minimum 1 hour, maximum 30 days.",
        type: "number",
        default: 24,
        min: 1,
        max: 720,
    },
    decimal_places: {
        label: "Decimal Places",
        description: "Precision of displayed sensor values. Minimum 0, maximum 4.",
        type: "number",
        default: 2,
        min: 0,
        max: 4,
    },
    ping_attempts: {
        label: "Ping Attempts",
        description: "Number of ping attempts when testing sensor connectivity. Minimum 3, maximum 10.",
        type: "number",
        default: 3,
        min: 3,
        max: 10,
    },
    ping_delay_ms: {
        label: "Ping Delay (ms)",
        description: "Delay between ping attempts in milliseconds. Minimum 100ms, maximum 5000ms.",
        type: "number",
        default: 500,
        min: 100,
        max: 5000,
        step: 100,
    },
    recent_ips_max: {
        label: "Recent IPs Max",
        description: "Maximum number of recently pinged IP addresses to remember. Minimum 5, maximum 20.",
        type: "number",
        default: 10,
        min: 5,
        max: 20,
    },
    unit_system: {
        label: "Unit System",
        description: "Display units for measurements (Metric or Imperial).",
        type: "enum",
        default: "Imperial",
        options: ["Metric", "Imperial"],
    },
    mqtt_broker_address: {
        label: "MQTT Broker Address",
        description: "IP address or hostname of the MQTT broker for real-time sensor data.",
        type: "string",
        default: "",
        optional: true,
    },
    mqtt_topic_telemetry: {
        label: "MQTT Topic — Telemetry",
        description: "MQTT topic to subscribe to for incoming sensor telemetry messages.",
        type: "string",
        default: "",
        optional: true,
    },
    mqtt_topic_command: {
        label: "MQTT Topic — Command",
        description: "MQTT topic to publish commands on (e.g., reboot, identify).",
        type: "string",
        default: "",
        optional: true,
    },
    mqtt_topic_command_response: {
        label: "MQTT Topic — Command Response",
        description: "MQTT topic where sensors reply with command results.",
        type: "string",
        default: "",
        optional: true,
    },

    // Air telemetry settings
    air_telemetry: {
        label: "Air Telemetry Configuration",
        description: "Configure which air sensor telemetry fields to display and their order.",
        type: "array",
        default: JSON.stringify(DEFAULT_SETTINGS.air_telemetry),
    },

    // Water telemetry settings
    water_telemetry: {
        label: "Water Telemetry Configuration",
        description: "Configure which water sensor telemetry fields to display and their order.",
        type: "array",
        default: JSON.stringify(DEFAULT_SETTINGS.water_telemetry),
    },

    // Light telemetry settings
    light_telemetry: {
        label: "Light Telemetry Configuration",
        description: "Configure which light sensor telemetry fields to display and their order.",
        type: "array",
        default: JSON.stringify(DEFAULT_SETTINGS.light_telemetry),
    },
};
