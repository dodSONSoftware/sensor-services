-- Copyright (c) 2026 dodson Software ( dodson labs )
-- SPDX-License-Identifier: MIT

-- Application settings table
-- Stores all application configuration as JSONB for flexibility
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings if table is empty
INSERT INTO app_settings (id, data, updated_at)
VALUES (1, '{
    "theme": "light",
    "dashboard_layout": "cards",
    "notification_level": "warn",
    "time_range_hours": 24,
    "decimal_places": 2,
    "ping_attempts": 3,
    "ping_delay_ms": 500,
    "recent_ips_max": 10,
    "unit_system": "Imperial",
    "mqtt_broker_address": "",
    "mqtt_topic_telemetry": "",
    "mqtt_topic_command": "",
    "mqtt_topic_command_response": "",
    "telemetry": {
        "air": [
            {"ui": "TEMPERATURE", "order": 0, "value": "temperature-c", "visible": true},
            {"ui": "HUMIDITY %", "order": 1, "value": "humidity-percent", "visible": true},
            {"ui": "DEW POINT", "order": 2, "value": "dew-point", "visible": true},
            {"ui": "FEELS LIKE", "order": 3, "value": "feels-like-c", "visible": true},
            {"ui": "PRESSURE", "order": 4, "value": "pressure-pascal", "visible": true},
            {"ui": "ALTITUDE", "order": 5, "value": "altitude-meters", "visible": true}
        ],
        "water": [
            {"ui": "TEMPERATURE", "order": 0, "value": "temperature-c", "visible": true}
        ],
        "light": [
            {"ui": "RAW AMBIENT LIGHT", "order": 0, "value": "raw-ambient-light", "visible": false},
            {"ui": "RAW UV LIGHT", "order": 1, "value": "raw-uv-light", "visible": false},
            {"ui": "LUX", "order": 2, "value": "lux", "visible": true},
            {"ui": "UV INDEX", "order": 3, "value": "uv-index", "visible": true}
        ]
    }
}'::jsonb, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create index on updated_at for tracking changes
CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);
