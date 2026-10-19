import test from "node:test";
import assert from "node:assert/strict";
import { mockResponse, endpoints } from "../mock-api.mjs";
test("all recorded endpoints return mock responses and log their payload", () => {
  for (const key of endpoints.keys()) {
    const [method, path] = key.split(" ");
    const calls = [];
    const payload = { answer: "example" };
    const r = mockResponse(method, path, payload, (...args) =>
      calls.push(args),
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0][1]).body, payload);
  }
});
test("question fixture contains all ten recorded questions", () => {
  const r = mockResponse(
    "GET",
    "/api/student/exam/questions",
    undefined,
    () => {},
  );
  assert.deepEqual(
    r.body.questions.map((q) => q.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  );
  assert.ok(r.body.questions.every((q) => q.html.length > 0));
});
test("writes do not change fixtures or persist answers", () => {
  mockResponse(
    "POST",
    "/api/student/exam/answers",
    { questionId: 1, answer: "test" },
    () => {},
  );
  assert.equal(
    endpoints.get("POST /api/student/exam/answers").answer,
    undefined,
  );
});
test("unknown endpoints return 404", () =>
  assert.equal(
    mockResponse("DELETE", "/api/student/verify", {}, () => {}).status,
    404,
  ));
