# Database Schema

This folder contains SQL scripts for setting up the sensor services database.

## Files

### `schema.sql`
Main schema definition file. Creates the `app_settings` table with default settings.

**To run:**
```bash
psql -h <host> -U <user> -d <database> -f schema.sql
```

### `migrate_theme_to_enum.sql`
Migration script to convert legacy boolean theme values to string enum format.

**Before:** `theme` was stored as boolean (`true` = light, `false` = dark)  
**After:** `theme` is stored as enum (`"light"` or `"dark"`)

**To run:**
```bash
psql -h <host> -U <user> -d <database> -f migrate_theme_to_enum.sql
```

## Table Structure

### `app_settings`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `data` | JSONB | Settings data (all configuration stored here) |
| `updated_at` | TIMESTAMP | Last update timestamp |

## Default Settings

The schema includes these default settings:

### UI Preferences
- `theme`: `"light"` (enum: "light", "dark")
- `dashboard_layout`: `"cards"` (enum: "cards", "list")
- `notification_level`: `"warn"` (enum: "none", "warn", "critical")
- `time_range_hours`: `24` (min: 1, max: 720)
- `decimal_places`: `2` (min: 0, max: 4)
- `ping_attempts`: `3` (min: 3, max: 10)
- `ping_delay_ms`: `500` (min: 0, max: 1000)
- `recent_ips_max`: `10` (min: 5, max: 20)
- `unit_system`: `"Imperial"` (enum: "Metric", "Imperial")

### Server Configuration
- `mqtt_broker_address`: `""`
- `mqtt_topic_telemetry`: `""`
- `mqtt_topic_command`: `""`
- `mqtt_topic_command_response`: `""`

### Telemetry Configuration
- `telemetry.air`: Array of air sensor fields to display
- `telemetry.water`: Array of water sensor fields to display
- `telemetry.light`: Array of light sensor fields to display
