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
    return { ok: true, json: async () => ({ ok: true }) };
  });
  await api("verify", { access_code: "ABC123" });
  await api("exam/heartbeat", { present: true });
  assert.deepEqual(bodies[0], { access_code: "ABC123" });
  assert.equal(bodies[1].session_id, "stale-exam");
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
