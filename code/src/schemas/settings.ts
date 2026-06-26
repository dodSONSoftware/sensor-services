/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import { z } from "zod";

/**
 * UI preferences for the Angular dashboard.
 */
export const uiPreferencesSchema = z.object({
    theme: z.enum(["light", "dark"]).default("light"),
    refresh_interval_ms: z.number().int().positive().min(1000).max(60000).default(5000),
    sensor_list_visible: z.boolean().default(true),
    dashboard_layout: z.enum(["grid", "list"]).default("grid"),
    cards_per_row: z.number().int().min(1).max(6).default(3),
    sound_enabled: z.boolean().default(false),
    notification_level: z.enum(["none", "warn", "critical"]).default("warn"),
    time_range_hours: z.number().int().positive().min(1).max(720).default(24),
    decimal_places: z.number().int().min(0).max(4).default(2),
});

/**
 * Server connection details that the Angular app needs to know.
 */
export const serverConfigSchema = z.object({
    mqtt_broker_address: z.string().optional(),
    mqtt_topic_telemetry: z.string().optional(),
    mqtt_topic_command: z.string().optional(),
    mqtt_topic_command_response: z.string().optional(),
    prometheus_port: z.number().int().positive().default(3301),
    express_port: z.number().int().positive().default(32000),
});

/**
 * Combined application settings schema with defaults for partial updates.
 */
export const appSettingsSchema = uiPreferencesSchema.merge(serverConfigSchema);

export type UiPreferences = z.infer<typeof uiPreferencesSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;

/**
 * Default settings values — used to fill in missing keys during partial updates.
 */
export const DEFAULT_SETTINGS: AppSettings = {
    theme: "light",
    refresh_interval_ms: 5000,
    sensor_list_visible: true,
    dashboard_layout: "grid",
    cards_per_row: 3,
    sound_enabled: false,
    notification_level: "warn",
    time_range_hours: 24,
    decimal_places: 2,
    prometheus_port: 3301,
    express_port: 32000,
} as const;

/**
 * Schema metadata for each setting — used by the frontend to discover available settings,
 * their types, valid ranges/enums, and defaults. Enables dynamic form generation without
 * hardcoding field definitions in the Angular app.
 */
export const SETTINGS_SCHEMA: Record<string, {
    label: string;
    description: string;
    type: "string" | "number" | "boolean";
    default: unknown;
    optional?: boolean;
    enum?: string[];
    min?: number;
    max?: number;
}> = {
    theme: {
        label: "Theme",
        description: "Dashboard color scheme.",
        type: "string",
        default: "light",
        enum: ["light", "dark"],
    },
    refresh_interval_ms: {
        label: "Refresh Interval (ms)",
        description: "How often the dashboard polls for new sensor data. Minimum 1000ms.",
        type: "number",
        default: 5000,
        min: 1000,
        max: 60000,
    },
    sensor_list_visible: {
        label: "Sensor List Visible",
        description: "Show or hide the sidebar list of sensors.",
        type: "boolean",
        default: true,
    },
    dashboard_layout: {
        label: "Dashboard Layout",
        description: "How sensor cards are arranged on the dashboard.",
        type: "string",
        default: "grid",
        enum: ["grid", "list"],
    },
    cards_per_row: {
        label: "Cards Per Row",
        description: "Number of sensor cards displayed across in grid layout. Minimum 1, maximum 6.",
        type: "number",
        default: 3,
        min: 1,
        max: 6,
    },
    sound_enabled: {
        label: "Sound Enabled",
        description: "Play alert sounds when thresholds are breached.",
        type: "boolean",
        default: false,
    },
    notification_level: {
        label: "Notification Level",
        description: "Minimum severity level that triggers alerts.",
        type: "string",
        default: "warn",
        enum: ["none", "warn", "critical"],
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
    prometheus_port: {
        label: "Prometheus Port",
        description: "Port for the Prometheus sensor metrics server.",
        type: "number",
        default: 3301,
        min: 1,
    },
    express_port: {
        label: "Express API Port",
        description: "Port for the main REST API server.",
        type: "number",
        default: 32000,
        min: 1,
    },
};
