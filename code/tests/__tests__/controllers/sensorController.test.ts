import { create_mqtt_command_message } from "../../../src/controllers/sensorController";

describe("create_mqtt_command_message", () => {
  it("should create a command message with default empty payload and a command-id", () => {
    const msg = create_mqtt_command_message("sensor-1", "identify");

    expect(msg).toMatchObject({
      "message-type": "command",
      "version": "2",
      "target": "sensor-1",
      "command": "identify",
      "payload": {},
    });
    expect(msg).toHaveProperty("command-id");
    expect(typeof msg["command-id"]).toBe("string");
    // command-id should be a valid UUID
    expect(msg["command-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("should lowercase target and command", () => {
    const msg = create_mqtt_command_message("SENSOR-1", "IDENTIFY");

    expect(msg["target"]).toBe("sensor-1");
    expect(msg["command"]).toBe("identify");
  });

  it("should trim whitespace from target and command", () => {
    const msg = create_mqtt_command_message("  sensor-1  ", "  identify  ");

    expect(msg["target"]).toBe("sensor-1");
    expect(msg["command"]).toBe("identify");
  });

  it("should include payload when provided", () => {
    const payload = { "write-config": { key: "value" } };
    const msg = create_mqtt_command_message("sensor-1", "write-config", payload);

    expect(msg["payload"]).toEqual(payload);
  });

  it("should use empty payload when payload is null", () => {
    const msg = create_mqtt_command_message("sensor-1", "reboot", null);

    expect(msg["payload"]).toEqual({});
  });

  it("should use empty payload when payload is undefined", () => {
    const msg = create_mqtt_command_message("sensor-1", "reboot");

    expect(msg["payload"]).toEqual({});
  });
});
