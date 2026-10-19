import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/api.js";
import { createMockApi } from "../mock-api.mjs";

test("login excludes stale session while exam requests keep their session", async (t) => {
  const originalStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify({ id: "stale-exam" }),
  };
  t.after(() => {
    if (originalStorage) globalThis.sessionStorage = originalStorage;
    else delete globalThis.sessionStorage;
  });
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  await api("verify", { access_code: "ABC123" });
  await api("exam/heartbeat", { present: true });
  assert.deepEqual(bodies[0], { access_code: "ABC123" });
  assert.equal(bodies[1].session_id, "stale-exam");
});

test("empty API responses produce a useful deployment error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  await assert.rejects(
    api("exam/questions"),
    (error) => {
      assert.match(error.message, /empty or invalid JSON response \(HTTP 200\)/);
      assert.match(error.message, /routes \/api requests to the backend/);
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("non-JSON API responses preserve the HTTP status for callers", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<html>not found</html>", { status: 404 }));
  await assert.rejects(api("verify"), (error) => {
    assert.match(error.message, /empty or invalid JSON response \(HTTP 404\)/);
    assert.equal(error.status, 404);
    return true;
  });
});

test("backend verification succeeds even if another client sends an unknown session", () => {
  const mock = createMockApi();
  const result = mock(
    "POST",
    "/api/student/verify",
    { access_code: "ABC123", session_id: "unknown" },
    () => {},
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.studentId, 2000);
});
