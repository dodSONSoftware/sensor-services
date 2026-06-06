import request from "supertest";
import express from "express";
import { CreateRouteNotFound } from "../../../src/routes/routeNotFound";

function createTestApp(): express.Application {
  const app = express();
  app.use(express.json());
  new CreateRouteNotFound(app);
  return app;
}

describe("Route Not Found (404)", () => {
  it("should return 404 for any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).get("/this-route-does-not-exist");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toHaveProperty("message");
    expect(res.body.message).toBe("The requested resource was not found.");
  });

  it("should return 404 for POST to any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).post("/also/does/not/exist");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("The requested resource was not found.");
  });

  it("should return 404 for PUT to any unmatched route", async () => {
    const app = createTestApp();

    const res = await request(app).put("/another/fake/route");

    expect(res.status).toBe(404);
  });
});
