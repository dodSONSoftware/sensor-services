/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

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

  describe("waitForCompletion", () => {
    it("should resolve after the silence timeout fires", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      const completion = mcc.waitForCompletion();
      expect(mcc.is_timed_out).toBe(false);

      jest.advanceTimersByTime(1000);
      expect(mcc.is_timed_out).toBe(true);

      await expect(completion).resolves.toBeUndefined();
    });

    it("should NOT resolve when restart_clock() is called", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      const completion = mcc.waitForCompletion();
      expect(mcc.is_timed_out).toBe(false);

      // Simulate a response arriving at 500ms
      jest.advanceTimersByTime(500);
      mcc.restart_clock();
      expect(mcc.is_timed_out).toBe(false);

      // The promise should still be pending. Create a race with a setTimeout,
      // then advance fake time so it fires and rejects — proving completion
      // hasn't resolved yet.
      const race = Promise.race([
        completion,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 100)
        ),
      ]);
      jest.advanceTimersByTime(100);
      await expect(race).rejects.toThrow("timeout");

      // Now advance past the restart timeout so completion resolves.
      jest.advanceTimersByTime(1000);
      await expect(completion).resolves.toBeUndefined();
    });

    it("should NOT resolve after multiple restart_clock() calls before timeout", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      const completion = mcc.waitForCompletion();
      expect(mcc.is_timed_out).toBe(false);

      // Simulate responses at 300ms, 600ms, 900ms
      jest.advanceTimersByTime(300);
      mcc.restart_clock();
      expect(mcc.is_timed_out).toBe(false);

      jest.advanceTimersByTime(300);
      mcc.restart_clock();
      expect(mcc.is_timed_out).toBe(false);

      jest.advanceTimersByTime(300);
      mcc.restart_clock();
      expect(mcc.is_timed_out).toBe(false);

      // After 900ms total, the promise should still be pending. Create a race
      // with a setTimeout, then advance fake time so it fires and rejects —
      // proving completion hasn't resolved yet.
      const race = Promise.race([
        completion,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 100)
        ),
      ]);
      jest.advanceTimersByTime(100);
      await expect(race).rejects.toThrow("timeout");

      // Now advance past the last restart_clock timeout (900 + 1000 = 1900)
      jest.advanceTimersByTime(2000);
      expect(mcc.is_timed_out).toBe(true);
      await expect(completion).resolves.toBeUndefined();
    });

    it("should resolve when deinitialize() is called", async () => {
      const mcc = new MqttCommandControl(10000);
      mcc.initialize();

      const completion = mcc.waitForCompletion();
      expect(mcc.is_timed_out).toBe(false);

      mcc.deinitialize();
      expect(mcc.is_timed_out).toBe(true);

      await expect(completion).resolves.toBeUndefined();
    });

    it("should return the same promise on repeated calls", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      const completion1 = mcc.waitForCompletion();
      const completion2 = mcc.waitForCompletion();
      expect(completion1).toBe(completion2);

      jest.advanceTimersByTime(1000);
      await expect(completion1).resolves.toBeUndefined();
      await expect(completion2).resolves.toBeUndefined();
    });

    it("should return an already-resolved promise after deinitialize", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();
      mcc.deinitialize();

      const completion = mcc.waitForCompletion();
      expect(mcc.is_timed_out).toBe(true);

      await expect(completion).resolves.toBeUndefined();
    });

    it("should return an already-resolved promise after timeout", async () => {
      const mcc = new MqttCommandControl(1000);
      mcc.initialize();

      jest.advanceTimersByTime(1000);
      expect(mcc.is_timed_out).toBe(true);

      const completion = mcc.waitForCompletion();
      await expect(completion).resolves.toBeUndefined();
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
