/*
 * Copyright (c) 2026 dodson Software ( dodson labs )
 * SPDX-License-Identifier: MIT
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "js-yaml";
import {
    readConfigWithSecrets,
    CONFIG_SECRETS_FILENAME,
} from "../../../src/schemas/configLoader";
import { validateConfig } from "../../../src/schemas/config";

/** A full, schema-valid config (every required key present). */
function fullConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        "log-level": "info",
        "express-port": 32000,
        "mqtt-broker-ip-address": "127.0.0.1",
        "mqtt-topic-telemetry": "iot/v3/telemetry",
        "mqtt-topic-command": "iot/v3/command",
        "mqtt-topic-command-response": "iot/v3/command-response",
        "ip-pinger-web-api": "http://127.0.0.1:3300",
        "case-sensitive": true,
        "db-host": "127.0.0.1",
        "db-port": 5432,
        "db-name": "sensor_web_services",
        "db-user": "appuser",
        "db-password": "base-secret",
        ...overrides,
    };
}

/** Write a YAML file from an object (or a raw string) and return its path. */
function writeYaml(dir: string, name: string, content: unknown): string {
    const p = path.join(dir, name);
    if (typeof content === "string") {
        fs.writeFileSync(p, content);
    } else {
        fs.writeFileSync(p, yaml.dump(content));
    }
    return p;
}

describe("readConfigWithSecrets (P1-4 config secrets split)", () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-loader-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("returns the base config unchanged when config-secrets.yml is absent", () => {
        const base = fullConfig();
        const basePath = writeYaml(tmpDir, "config.yml", base);

        const result = readConfigWithSecrets(basePath);

        expect(result.error).toBeNull();
        expect(result.data).toEqual(base);
        // No secrets file was created
        expect(fs.existsSync(path.join(tmpDir, CONFIG_SECRETS_FILENAME))).toBe(false);
    });

    it("merges config-secrets.yml over the base (secrets override)", () => {
        const base = fullConfig({ "db-password": "base-secret", "log-level": "info" });
        const secrets = { "db-password": "real-secret" };
        const basePath = writeYaml(tmpDir, "config.yml", base);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, secrets);

        const result = readConfigWithSecrets(basePath);

        expect(result.error).toBeNull();
        // The secret from config-secrets.yml wins
        expect(result.data?.["db-password"]).toBe("real-secret");
        // Non-secret keys come from the base
        expect(result.data?.["log-level"]).toBe("info");
        expect(result.data?.["express-port"]).toBe(32000);
    });

    it("does not mutate the base document when merging", () => {
        const base = fullConfig();
        const basePath = writeYaml(tmpDir, "config.yml", base);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, { "db-password": "real-secret" });

        const result = readConfigWithSecrets(basePath);

        // The original base object on disk is untouched by the merge
        const onDisk = yaml.load(fs.readFileSync(basePath, "utf8")) as Record<string, unknown>;
        expect(onDisk["db-password"]).toBe("base-secret");
        expect(result.data?.["db-password"]).toBe("real-secret");
    });

    it("treats a present-but-empty config-secrets.yml as absent", () => {
        const base = fullConfig();
        const basePath = writeYaml(tmpDir, "config.yml", base);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, ""); // empty file

        const result = readConfigWithSecrets(basePath);

        expect(result.error).toBeNull();
        expect(result.data).toEqual(base);
    });

    it("returns an error (not a silent fallback) when config-secrets.yml is present but unparseable", () => {
        const base = fullConfig();
        const basePath = writeYaml(tmpDir, "config.yml", base);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, "db-password: [unclosed"); // malformed YAML

        const result = readConfigWithSecrets(basePath);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/config secrets .* is unreadable/i);
    });

    it("returns an error when config-secrets.yml is present but not a YAML mapping", () => {
        const base = fullConfig();
        const basePath = writeYaml(tmpDir, "config.yml", base);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, ["a", "b"]); // a list, not a mapping

        const result = readConfigWithSecrets(basePath);

        expect(result.data).toBeNull();
        expect(result.error).toMatch(/must be a YAML mapping/i);
    });

    it("returns an error when the base config is missing", () => {
        const result = readConfigWithSecrets(path.join(tmpDir, "does-not-exist.yml"));

        expect(result.data).toBeNull();
        expect(result.error).not.toBeNull();
    });

    it("merged config with the secret from config-secrets.yml passes validation", () => {
        // Base has NO db-password (a secret); the secrets file supplies it.
        const baseNoSecret = fullConfig();
        delete baseNoSecret["db-password"];
        const basePath = writeYaml(tmpDir, "config.yml", baseNoSecret);
        writeYaml(tmpDir, CONFIG_SECRETS_FILENAME, { "db-password": "real-secret" });

        const result = readConfigWithSecrets(basePath);

        expect(result.error).toBeNull();
        // Validation of the MERGED config succeeds because db-password is present
        expect(() => validateConfig(result.data)).not.toThrow();
    });

    it("a secret-less base with no config-secrets.yml FAILS validation (missing required secret)", () => {
        const baseNoSecret = fullConfig();
        delete baseNoSecret["db-password"];
        const basePath = writeYaml(tmpDir, "config.yml", baseNoSecret);
        // No config-secrets.yml

        const result = readConfigWithSecrets(basePath);

        expect(result.error).toBeNull();
        expect(result.data).toEqual(baseNoSecret);
        // The merged (== base) config lacks the required db-password -> validation fails
        expect(() => validateConfig(result.data)).toThrow(/db-password/i);
    });
});
