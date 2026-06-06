import { create_mqtt_command_message } from "../../../src/controllers/sensorController";

describe("create_mqtt_command_message", () => {
  it("should create a command message with default empty payload", () => {
    const msg = create_mqtt_command_message("sensor-1", "identify");

    expect(msg).toEqual({
      "message-type": "command",
      "version": "2",
      "target": "sensor-1",
      "command": "identify",
      "payload": {},
    });
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
