import { aboutDude } from "../../../src/common/global";

describe("aboutDude", () => {
  it("should return an IAbout object with expected structure", () => {
    const about = aboutDude();

    expect(about).toHaveProperty("about");
    expect(about.about).toHaveProperty("name");
    expect(about.about).toHaveProperty("version");
    expect(about.about).toHaveProperty("author");
    expect(about.about).toHaveProperty("copyright");
    expect(about.about).toHaveProperty("license");
    expect(about.about).toHaveProperty("description");
    expect(about).toHaveProperty("commands");
    expect(Array.isArray(about.commands)).toBe(true);
    expect(about).toHaveProperty("system_info");
    expect(Array.isArray(about.system_info)).toBe(true);
  });

  it("should return the same cached object on subsequent calls", () => {
    const first = aboutDude();
    const second = aboutDude();
    expect(first).toBe(second);
  });

  it("should have a non-empty name", () => {
    const about = aboutDude();
    expect(about.about.name).toBeTruthy();
  });

  it("should have a version string", () => {
    const about = aboutDude();
    expect(typeof about.about.version).toBe("string");
  });
});
