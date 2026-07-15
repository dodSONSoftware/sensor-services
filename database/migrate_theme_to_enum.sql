-- Copyright (c) 2026 dodson Software ( dodson labs )
-- SPDX-License-Identifier: MIT

-- Migration: Convert legacy boolean theme values to string enum
-- Before: theme was stored as boolean (true = light, false = dark)
-- After: theme is stored as enum ("light" or "dark")

UPDATE app_settings
SET data = jsonb_set(
    data,
    '{theme}',
    CASE
        WHEN data->>'theme' = 'true' THEN '"light"'
        WHEN data->>'theme' = 'false' THEN '"dark"'
        ELSE data->>'theme'
    END::jsonb
)
WHERE data ? 'theme';
