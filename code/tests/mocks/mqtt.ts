/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import type { MqttNetworking } from "../../src/dodsonlabs/MqttNetworking";
import type { IMqttCommandControl } from "../../src/dodsonlabs/Interfaces";

export function createMockMqttNetworking(overrides: Partial<MqttNetworking> = {}): MqttNetworking {
  const mockCommandControl: IMqttCommandControl = {
    is_running: false,
    is_timed_out: true,
    timeout: null,
    results: [{ source: "test", payload: {} }],
    initialize: jest.fn(),
    deinitialize: jest.fn(),
    clear_results: jest.fn(),
    restart_clock: jest.fn(),
    cancel_clock: jest.fn(),
    waitForCompletion: jest.fn().mockResolvedValue(undefined),
  };

  return {
    mqtt_topic_command: "test/command",
    mqtt_topic_command_response: "test/command-response",
    is_connected: jest.fn().mockReturnValue(true),
    publish_mqtt_message: jest.fn(),
    register_command_id: jest.fn(),
    close: jest.fn(),
    get_cr_dude: jest.fn().mockReturnValue(mockCommandControl),
    ...overrides,
  } as unknown as MqttNetworking;
}
