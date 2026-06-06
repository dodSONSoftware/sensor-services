import { MqttCommandControl } from "../../../src/dodsonlabs/MqttCommandControl";

describe("MqttCommandControl", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("initial state", () => {
    it("should start with default timeout duration of 1500ms", () => {
      const mcc = new MqttCommandControl();
      expect(mcc.timeout_duration_ms).toBe(1500);
    });

    it("should allow custom timeout duration", () => {
      const mcc = new MqttCommandControl(5000);
      expect(mcc.timeout_duration_ms).toBe(5000);
    });

    it("should start with is_running false", () => {
      const mcc = new MqttCommandControl();
      expect(mcc.is_running).toBe(false);
    });

    it("should start with is_timed_out false", () => {
      const mcc = new MqttCommandControl();
      expect(mcc.is_timed_out).toBe(false);
    });

    it("should start with empty results array", () => {
      const mcc = new MqttCommandControl();
      expect(mcc.results).toEqual([]);
    });
  });

  describe("initialize", () => {
    it("should set is_running to true", () => {
      const mcc = new MqttCommandControl();
      mcc.initialize();
      expect(mcc.is_running).toBe(true);
    });

    it("should set is_timed_out to false", () => {
      const mcc = new MqttCommandControl();
      mcc.initialize();
      expect(mcc.is_timed_out).toBe(false);
    });

    it("should clear results array", () => {
      const mcc = new MqttCommandControl();
      mcc.results = [{ source: "test", payload: {} }];
      mcc.initialize();
      expect(mcc.results).toEqual([]);
    });

    it("should start the timeout clock", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      expect(mcc.timeout).not.toBeNull();
    });
  });

  describe("deinitialize", () => {
    it("should set is_running to false", () => {
      const mcc = new MqttCommandControl();
      mcc.initialize();
      mcc.deinitialize();
      expect(mcc.is_running).toBe(false);
    });

    it("should set is_timed_out to true", () => {
      const mcc = new MqttCommandControl();
      mcc.initialize();
      mcc.deinitialize();
      expect(mcc.is_timed_out).toBe(true);
    });

    it("should cancel the timeout clock", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      mcc.deinitialize();
      expect(mcc.timeout).toBeNull();
    });
  });

  describe("restart_clock", () => {
    it("should clear existing timeout and set a new one", () => {
      const mcc = new MqttCommandControl(2000);
      mcc.initialize();
      const firstTimeout = mcc.timeout;

      mcc.restart_clock();
      expect(mcc.timeout).not.toBe(firstTimeout);
    });

    it("should not set is_timed_out before the new timeout fires", () => {
      const mcc = new MqttCommandControl(2000);
      mcc.initialize();
      mcc.restart_clock();

      jest.advanceTimersByTime(1000);
      expect(mcc.is_timed_out).toBe(false);
    });

    it("should set is_timed_out after the new timeout fires", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      mcc.restart_clock();

      jest.advanceTimersByTime(1000);
      expect(mcc.is_timed_out).toBe(true);
    });
  });

  describe("cancel_clock", () => {
    it("should clear the timeout and set it to null", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      mcc.cancel_clock();
      expect(mcc.timeout).toBeNull();
    });

    it("should not set is_timed_out when clock is cancelled", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      mcc.cancel_clock();

      jest.advanceTimersByTime(2000);
      expect(mcc.is_timed_out).toBe(false);
    });

    it("should be safe to call when no clock is running", () => {
      const mcc = new MqttCommandControl();
      expect(() => mcc.cancel_clock()).not.toThrow();
    });
  });

  describe("timeout behavior", () => {
    it("should set is_timed_out after timeout_duration_ms", () => {
      const mcc = new MqttCommandControl(5000);
      mcc.initialize();
      expect(mcc.is_timed_out).toBe(false);

      jest.advanceTimersByTime(4999);
      expect(mcc.is_timed_out).toBe(false);

      jest.advanceTimersByTime(1);
      expect(mcc.is_timed_out).toBe(true);
    });

    it("should handle restart_clock extending the timeout", () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      // Advance 500ms — original timer would fire at 1000ms, not yet
      jest.advanceTimersByTime(500);
      expect(mcc.is_timed_out).toBe(false);

      // Restart the clock — new timeout at 500+1000=1500
      mcc.restart_clock();

      // Advance 499ms more (total 999ms from start) — new timer fires at 1500
      jest.advanceTimersByTime(499);
      expect(mcc.is_timed_out).toBe(false);

      // Advance 1ms more (total 1000ms from start) — still before 1500
      jest.advanceTimersByTime(1);
      expect(mcc.is_timed_out).toBe(false);

      // Advance 500ms more (total 1500ms from start) — new timer fires
      jest.advanceTimersByTime(500);
      expect(mcc.is_timed_out).toBe(true);
    });
  });
});
