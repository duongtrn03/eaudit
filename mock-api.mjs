import { EVENTS } from "./src/anti-cheat.js";
const VIOLATIONS = new Set(EVENTS);
import questions from "./questions.json" with { type: "json" };
export const endpoints = new Map([
  [
    "POST /api/student/verify",
    { email: "abc@gmail.com", studentId: 2000, duration: 3600 },
  ],
  ["GET /api/student/exam/questions", { questions, duration: 3600 }],
  ["POST /api/student/violation", { mock: true }],
  ["POST /api/student/exam/heartbeat", { mock: true }],
  ...[
    "exam/start",
    "exam/answers",
    "exam/recording-url",
    "exam/recording-complete",
    "exam/recording-finalize",
    "exam/recording-seal",
    "exam/submit",
    "live/session",
  ].map((p) => ["POST /api/student/" + p, { mock: true }]),
]);
export function createMockApi() {
  const sessions = new Map();
  const current = new Map();
  return function mockResponse(method, path, body, log = console.log) {
    const key = method + " " + path;
    log(
      "[MOCK API]",
      JSON.stringify({ time: new Date().toISOString(), method, path, body }),
    );
    if (!endpoints.has(key))
      return {
        status: 404,
        body: { ok: false, error: "Unknown mock endpoint" },
      };
    // Verification starts a new login and must not depend on a previous exam.
    if (path === "/api/student/verify")
      return { status: 200, body: { ok: true, ...endpoints.get(key) } };
    const sid = body?.session_id;
    const ok = (data) => ({
      status: 200,
      body: { ok: true, mock: true, ...data },
    });
    if (sid && path.endsWith("/exam/start")) {
      if (!sessions.has(sid)) {
        sessions.set(sid, {
          student: body.student_id,
          deadline: Date.now() + 3600000,
          count: 0,
          events: new Map(),
          answers: [],
          submitted: false,
          locked: false,
          lastSeen: Date.now(),
          parts: new Map(),
        });
        current.set(body.student_id, sid);
      }
      return ok({
        time_remaining: 3600,
        recording_mode: ["none", "live", "local", "s3"].includes(
          body.recording_mode,
        )
          ? body.recording_mode
          : "s3",
        capture: "mock",
        live_enabled: false,
      });
    }
    if (sid) {
      const s = sessions.get(sid);
      if (!s)
        return {
          status: 410,
          body: { ok: false, reason: "concurrent_session" },
        };
      if (path.endsWith("/exam/submit")) {
        if (!s.submitted) {
          s.submitted = true;
          s.locked = true;
          s.answers = body.answers || [];
          s.submission = {
            reason: body.reason,
            answers: s.answers,
            violations: s.count,
          };
        }
        return ok({ submitted: true, ...s.submission });
      }
      if (path.includes("/recording-")) {
        if (path.endsWith("/recording-url"))
          return ok({
            uploadId: sid,
            partIndex: body.partIndex,
            uploadUrl: `/api/mock-recording/${sid}/${body.partIndex}`,
            mode: "mock",
          });
        if (path.endsWith("/recording-complete"))
          s.parts.set(body.partIndex, { byteSize: body.byteSize });
        return ok({
          acknowledged: true,
          parts: [...s.parts.keys()],
          finalized: path.endsWith("/recording-finalize"),
        });
      }
      if (s.submitted)
        return { status: 410, body: { ok: false, reason: "submitted" } };
      if (current.get(s.student) !== sid)
        return {
          status: 410,
          body: { ok: false, reason: "concurrent_session" },
        };
      if (Date.now() >= s.deadline)
        return { status: 410, body: { ok: false, reason: "timeout" } };
      if (Date.now() - s.lastSeen > 120000)
        return { status: 410, body: { ok: false, reason: "absent_too_long" } };
      if (path.endsWith("/violation")) {
        const id = body.eventId || body.event_id;
        if (!id)
          return {
            status: 400,
            body: { ok: false, error: "eventId required" },
          };
        if (s.events.has(id)) return ok(s.events.get(id));
        if (s.locked)
          return ok({ ignored: true, locked: true, violation_count: s.count });
        if (!VIOLATIONS.has(body.type))
          return {
            status: 400,
            body: { ok: false, error: "Unknown violation type" },
          };
        s.count++;
        s.locked = s.count >= 2;
        const decision = {
          ignored: false,
          forensic_only: false,
          locked: s.locked,
          violation_count: s.count,
        };
        s.events.set(id, decision);
        return ok(decision);
      }
      if (path.endsWith("/exam/heartbeat")) {
        if (body.present) s.lastSeen = Date.now();
        return ok({
          time_remaining: Math.max(
            0,
            Math.ceil((s.deadline - Date.now()) / 1000),
          ),
          locked: s.locked,
          violation_count: s.count,
        });
      }
      if (path.endsWith("/exam/answers")) {
        if (s.locked) return ok({ ignored: true, locked: true });
        s.answers = body.answers || [];
      }
    }
    return { status: 200, body: { ok: true, ...endpoints.get(key) } };
  };
}
export const mockResponse = createMockApi();
