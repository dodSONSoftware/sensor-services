import type { Config } from "jest";

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: ["**/*.test.ts"],
    moduleFileExtensions: ["ts", "js", "json"],
    setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/dodsonlabs/**/*.ts",
        "!src/index.ts",
    ],
    coverageDirectory: "coverage",
    // Thresholds apply only to app code (src/**/*.ts excluding dodsonlabs/, index.ts).
    // dodsonlabs/ is a shared submodule excluded from coverage.
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70,
        },
    },
};

export default config;
