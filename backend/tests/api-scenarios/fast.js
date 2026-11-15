import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = "/api/v1/service-requests";
const hour = 3_600_000;
const fee = { amount: 250000, currency: "NGN" };
const actions = [
  ["notes", "homeowner", () => ({ text: "The tap is upstairs" })],
  ["accept", "artisan", () => ({ inspectionFee: fee })],
  ["reject", "artisan", () => ({ reason: "Unavailable for this appointment" })],
  ["cancel", "homeowner", () => ({})],
  ["inspection/complete", "artisan", () => ({})],
  ["quote", "artisan", (now) => ({
    scope: "Replace damaged tap and fittings", total: { amount: 10001, currency: "NGN" },
    repairWindow: { start: new Date(now + 48 * hour).toISOString(), end: new Date(now + 49 * hour).toISOString() },
    expiresAt: new Date(now + 2 * hour).toISOString(),
  })],
  ["quote/approve", "homeowner", () => ({})],
  ["quote/decline", "homeowner", () => ({})],
  ["repair/start", "artisan", () => ({})],
  ["repair/complete", "artisan", () => ({})],
  ["completion/confirm", "homeowner", () => ({})],
  ["problems", "homeowner", () => ({ explanation: "The tap still leaks" })],
];

const sameBooking = (before, after) => assert.deepEqual(after, before, "Denied actions must not modify the request");
const paymentError = (statusCode) => (error) => error.statusCode === statusCode;

export const runFast = async (h) => {
  let homeowner;
  let secondHomeowner;
  let stranger;
  let artisan;
  let otherArtisan;
  let admin;
  let original;
  let accepted;
  let crossProcess;
  let sequence = 0;
  const reference = () => `scenario:${randomUUID()}`;
  const requestBody = (target = artisan, fields = {}) => {
    const start = h.now() + (24 + sequence++ * 2) * hour;
    return {
      artisan: target.id,
      description: "Repair the leaking kitchen tap",
      serviceAddress: `PRIVATE SCENARIO ADDRESS ${randomUUID()}`,
      inspectionWindow: { start: new Date(start).toISOString(), end: new Date(start + hour).toISOString() },
      responseDeadline: new Date(h.now() + hour).toISOString(),
      ...fields,
    };
  };
  const create = async (owner = homeowner, target = artisan, fields = {}) => {
    const result = await h.request("POST", base, { actor: owner, body: requestBody(target, fields), status: 201 });
    assert.equal(result.body.success, true);
    assert.ok(result.body.data.id);
    return result.body.data;
  };
  const detail = async (id, actor = homeowner, server = 0) =>
    (await h.request("GET", `${base}/${id}`, { actor, status: 200, server })).body.data;
  const action = (id, name, actor, body = {}, status = 200, server = 0) =>
    h.request("POST", `${base}/${id}/${name}`, { actor, body, status, server });
  const accept = (booking, target = artisan, server = 0) =>
    action(booking.id, "accept", target, { inspectionFee: fee }, 200, server);
  const event = (id, fields = {}) => ({ requestId: id, purpose: "inspection", ...fee, externalReference: reference(), ...fields });

  await h.scenario("F01", "Create real API actors, authenticate, and enforce registration/profile ownership", async () => {
    [homeowner, secondHomeowner, stranger, artisan, otherArtisan, admin] = await Promise.all([
      h.actor(), h.actor(), h.actor(), h.actor("artisan"), h.actor("artisan"), h.actor("admin"),
    ]);
    for (const [actor, role] of [[homeowner, "house_owner"], [artisan, "artisan"], [admin, "admin"]]) {
      const personal = await h.request("GET", "/api/v1/users/me", { actor, status: 200 });
      assert.equal(personal.body.data.id, actor.id);
      assert.equal(personal.body.data.role, role);
      assert.equal(personal.body.data.password, undefined);
    }
    const personalProfile = await h.request("GET", "/api/v1/artisan/profile/me", { actor: artisan, status: 200 });
    assert.equal(personalProfile.body.data.user_id, artisan.id);
    assert.equal(personalProfile.body.data.id, artisan.profileId);
    await h.request("POST", "/api/v1/auth/register", { body: {
      firstName: "Duplicate", lastName: "Account", email: homeowner.email, password: homeowner.password,
    }, status: 409 });
    await h.request("POST", "/api/v1/auth/register", { body: {
      firstName: "Public", lastName: "Administrator", email: `${randomUUID()}@fixly.test`,
      password: homeowner.password, role: "admin",
    }, status: 400 });
    await h.request("POST", "/api/v1/auth/login", {
      body: { email: homeowner.email, password: "IncorrectPass123" }, status: 401,
    });
    await h.request("POST", "/api/v1/artisan/profile", { actor: homeowner, body: {}, status: 403 });
  });

  await h.scenario("F02", "Submit a private request and retrieve it through participant detail and paginated lists", async () => {
    original = await create();
    assert.equal(original.status, "pending");
    assert.equal(original.homeowner, homeowner.id);
    assert.equal(original.artisan, artisan.id);
    for (const actor of [homeowner, artisan]) {
      const record = await detail(original.id, actor);
      assert.equal(record.serviceAddress, original.serviceAddress);
      assert.equal(record.description, original.description);
      const list = await h.request("GET", `${base}?page=1&limit=1`, { actor, status: 200 });
      assert.equal(list.body.meta.total, 1);
      assert.equal(list.body.data.length, 1);
      assert.equal(list.body.data[0].id, original.id);
      assert.equal(record.email, undefined);
      assert.equal(record.password, undefined);
    }
  });

  await h.scenario("F03", "Protect every service-request route and hide bookings from unrelated users and administrators", async () => {
    const before = await detail(original.id);
    for (const [method, path, body] of [
      ["POST", base, requestBody()], ["GET", base], ["GET", `${base}/${original.id}`],
      ...actions.map(([name, , input]) => ["POST", `${base}/${original.id}/${name}`, input(h.now())]),
    ]) {
      await h.request(method, path, { body, status: 401 });
      await h.request(method, path, { body, headers: { Authorization: "Bearer malformed-token" }, status: 401 });
    }
    for (const actor of [stranger, otherArtisan, admin]) {
      await h.request("GET", `${base}/${original.id}`, { actor, status: 404 });
      const list = await h.request("GET", `${base}?page=1&limit=1`, { actor, status: 200 });
      assert.equal(list.body.meta.total, 0);
      assert.equal(list.body.data.length, 0);
      for (const [name, , input] of actions) {
        await action(original.id, name, actor, input(h.now()), 404);
      }
    }
    const directory = await h.request("GET", "/api/v1/artisan/profiles", { status: 200 });
    const publicProfile = await h.request("GET", `/api/v1/artisan/profile/${artisan.profileId}`, { status: 200 });
    for (const response of [directory, publicProfile]) {
      assert.equal(JSON.stringify(response.body).includes(original.serviceAddress), false);
    }
    for (const field of ["phone_number", "residential_address", "office_address"]) {
      assert.equal(publicProfile.body.data[field], undefined);
    }
    sameBooking(before, await detail(original.id));
  });

  await h.scenario("F04", "Enforce the assigned participant for every action and reject ineligible request creators", async () => {
    const before = await detail(original.id);
    for (const [name, participant, input] of actions) {
      const wrong = participant === "homeowner" ? artisan : homeowner;
      await action(original.id, name, wrong, input(h.now()), 403);
    }
    await h.request("POST", base, { actor: otherArtisan, body: requestBody(), status: 403 });
    await h.request("POST", base, { actor: admin, body: requestBody(), status: 403 });
    await h.request("POST", base, { actor: artisan, body: requestBody(), status: 400 });
    const noProfile = await h.actor("artisan", { profile: false });
    await h.request("POST", base, { actor: homeowner, body: requestBody(noProfile), status: 400 });
    await h.request("POST", base, { actor: homeowner, body: requestBody(secondHomeowner), status: 400 });
    sameBooking(before, await detail(original.id));
  });

  await h.scenario("F05", "Reject spoofed state, invalid inputs, malformed IDs and pagination without side effects", async () => {
    const before = await h.request("GET", base, { actor: homeowner, status: 200 });
    const originalBefore = await detail(original.id);
    const valid = requestBody();
    for (const changes of [
      { homeowner: stranger.id }, { status: "completed" }, { paid: true }, { verifiedPayments: [] },
      { artisan: "invalid" }, { artisan: { $ne: null } }, { description: "" }, { serviceAddress: "" },
      { inspectionWindow: { start: new Date(h.now() - hour).toISOString(), end: valid.inspectionWindow.end } },
      { inspectionWindow: { start: valid.inspectionWindow.end, end: valid.inspectionWindow.start } },
      { inspectionWindow: { start: valid.inspectionWindow.start, end: valid.inspectionWindow.start } },
      { inspectionWindow: { ...valid.inspectionWindow, start: "2027-01-01T10:00:00" } },
      { inspectionWindow: { start: "2027-02-30T10:00:00Z", end: "2027-03-02T11:00:00Z" } },
      { inspectionWindow: { ...valid.inspectionWindow, paid: true } },
      { responseDeadline: new Date(h.now() - hour).toISOString() },
      { responseDeadline: new Date(h.now() + 30_000).toISOString() },
      { responseDeadline: new Date(h.now() + 8 * 24 * hour).toISOString() },
      { responseDeadline: new Date(Date.parse(valid.inspectionWindow.end) + hour).toISOString() },
    ]) await h.request("POST", base, { actor: homeowner, body: { ...valid, ...changes }, status: 400 });
    for (const inspectionFee of [
      { amount: "250000", currency: "NGN" }, { amount: 0, currency: "NGN" },
      { amount: 1.5, currency: "NGN" }, { amount: 250000, currency: "ngn" },
      { amount: 250000, currency: "NOT_A_CURRENCY" }, { ...fee, paid: true },
    ]) await action(original.id, "accept", artisan, { inspectionFee }, 400);
    await h.request("GET", `${base}/invalid`, { actor: homeowner, status: 400 });
    await h.request("GET", `${base}/${"0".repeat(24)}`, { actor: homeowner, status: 404 });
    for (const query of ["page=invalid", "page=1&page=2", "limit=2.5", "limit=1&limit=2"]) {
      await h.request("GET", `${base}?${query}`, { actor: homeowner, status: 400 });
    }
    const list = await h.request("GET", `${base}?limit=1000`, { actor: homeowner, status: 200 });
    assert.equal(list.body.meta.limit, 100);
    assert.equal(list.body.meta.total, before.body.meta.total);
    sameBooking(originalBefore, await detail(original.id));
  });

  await h.scenario("F06", "Append pending clarification without permitting edits to original request details", async () => {
    await action(original.id, "notes", homeowner, { text: "The tap is upstairs", serviceAddress: "Replacement address" }, 400);
    const noted = await action(original.id, "notes", homeowner, { text: "The tap is upstairs" });
    assert.equal(noted.body.data.notes.length, 1);
    assert.equal(noted.body.data.notes[0].text, "The tap is upstairs");
    assert.equal(noted.body.data.description, original.description);
    assert.equal(noted.body.data.serviceAddress, original.serviceAddress);
    await h.request("PATCH", `${base}/${original.id}`, { actor: homeowner, body: { description: "Replacement scope" }, status: 404 });
    assert.equal((await detail(original.id)).serviceAddress, original.serviceAddress);
  });

  await h.scenario("F07", "Reject and cancel requests without reviving terminal states or retaining unpaid reservations", async () => {
    const rejected = await create();
    await action(rejected.id, "reject", artisan, { reason: "Unavailable for this appointment" });
    assert.equal((await detail(rejected.id)).status, "rejected");
    await action(rejected.id, "accept", artisan, { inspectionFee: fee }, 409);
    assert.equal((await detail(rejected.id)).status, "rejected");
    const pending = await create();
    await action(pending.id, "cancel", homeowner);
    assert.equal((await detail(pending.id)).status, "cancelled");
    await action(pending.id, "accept", artisan, { inspectionFee: fee }, 409);
    assert.equal((await detail(pending.id)).status, "cancelled");
    const unpaid = await create();
    await accept(unpaid);
    await action(unpaid.id, "cancel", homeowner);
    const cancelled = await detail(unpaid.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.inspection.state, "released");
    const replacement = await create(secondHomeowner, artisan, { inspectionWindow: unpaid.inspectionWindow });
    await accept(replacement);
    assert.equal((await detail(replacement.id, secondHomeowner)).inspection.state, "reserved");
  });

  await h.scenario("F08", "Snapshot the inspection fee and reserve time without implying payment", async () => {
    accepted = (await accept(original)).body.data;
    assert.equal(accepted.status, "awaiting_inspection_payment");
    assert.equal(accepted.inspection.state, "reserved");
    assert.deepEqual(accepted.inspectionFee, fee);
    assert.equal(accepted.payments.length, 0);
    assert.ok(Date.parse(accepted.inspection.paymentDeadline) <= Date.parse(original.inspectionWindow.start));
    const reservationDuration = Date.parse(accepted.inspection.paymentDeadline) - Date.parse(accepted.acceptedAt);
    assert.ok(reservationDuration > 0 && reservationDuration <= 30 * 60_000);
    await h.request("PATCH", `/api/v1/artisan/profile/${artisan.profileId}`, {
      actor: artisan, body: { starting_price: 99999 }, status: 200,
    });
    assert.deepEqual((await detail(original.id)).inspectionFee, fee);
    await action(original.id, "notes", homeowner, { text: "Late clarification" }, 409);
    await action(original.id, "accept", artisan, { inspectionFee: fee }, 409);
  });

  await h.scenario("F09", "Keep payment confirmation private and reject mismatched verified events", async () => {
    const before = await detail(original.id);
    for (const fields of [{ amount: fee.amount + 1 }, { currency: "USD" }, { purpose: "repair_deposit" }]) {
      await assert.rejects(() => h.pay(event(original.id, fields)), paymentError(422));
    }
    await assert.rejects(() => h.pay(event(original.id, { purpose: "invented-purpose" })), paymentError(400));
    await h.request("POST", `${base}/${original.id}/pay`, { actor: homeowner, body: { paid: true }, status: 404 });
    await h.request("POST", `${base}/${original.id}/mark-paid`, { actor: homeowner, body: { paid: true }, status: 404 });
    await action(original.id, "inspection/complete", artisan, { paid: true }, 400);
    assert.equal(await h.countPayments(original.id), 0);
    sameBooking(before, await detail(original.id));
  });

  await h.scenario("F10", "Apply a verified inspection event once and reject cross-request reference reuse", async () => {
    const payment = event(original.id);
    assert.equal((await h.pay(payment)).outcome, "applied");
    assert.equal((await h.pay(payment)).outcome, "applied");
    const paid = await detail(original.id);
    assert.equal(paid.status, "inspection_confirmed");
    assert.equal(paid.inspection.state, "confirmed");
    assert.equal(paid.payments.length, 1);
    assert.equal(paid.payments[0].externalReference, undefined);
    assert.equal(await h.countPayments(original.id), 1);
    await assert.rejects(() => h.pay({ ...payment, amount: fee.amount + 1 }), paymentError(409));
    const other = await create();
    await accept(other);
    await assert.rejects(() => h.pay({ ...payment, requestId: other.id }), paymentError(409));
    sameBooking(paid, await detail(original.id));
    assert.equal((await detail(other.id)).status, "awaiting_inspection_payment");
    assert.equal(await h.countPayments(other.id), 0);
    const list = await h.request("GET", base, { actor: homeowner, status: 200 });
    for (const row of list.body.data) {
      for (const summary of row.payments) assert.equal(summary.externalReference, undefined);
    }
  });

  await h.scenario("F10-concurrent", "Apply a globally unique payment reference to only one of two independent concurrent requests", async () => {
    const first = await create();
    const second = await create(secondHomeowner, otherArtisan);
    await accept(first);
    await accept(second, otherArtisan);
    const sharedReference = reference();
    const results = await Promise.allSettled([
      h.pay(event(first.id, { externalReference: sharedReference })),
      h.pay(event(second.id, { externalReference: sharedReference })),
    ]);
    const applied = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(applied.length, 1);
    assert.equal(applied[0].value.outcome, "applied");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason.statusCode, 409);
    const records = [await detail(first.id), await detail(second.id, secondHomeowner)];
    assert.deepEqual(records.map((record) => record.payments.length).sort(), [0, 1]);
    assert.deepEqual(records.map((record) => record.status).sort(), ["awaiting_inspection_payment", "inspection_confirmed"]);
    assert.equal(await h.countPayments(first.id) + await h.countPayments(second.id), 1);
  });

  await h.scenario("F11", "Reject early inspection completion, premature quotes and cancellation of paid appointments", async () => {
    const before = await detail(original.id);
    await action(original.id, "inspection/complete", artisan, {}, 409);
    await action(original.id, "cancel", homeowner, {}, 409);
    await action(original.id, "quote", artisan, actions.find(([name]) => name === "quote")[2](h.now()), 409);
    await action(original.id, "repair/start", artisan, {}, 409);
    await action(original.id, "repair/complete", artisan, {}, 409);
    await action(original.id, "completion/confirm", homeowner, {}, 409);
    await action(original.id, "problems", homeowner, { explanation: "Work has not started" }, 409);
    sameBooking(before, await detail(original.id));
  });

  await h.scenario("F12", "Allow exactly one overlapping inspection reservation across two HTTP server processes", async () => {
    const secondServer = await h.startServer();
    const first = await create();
    const second = await create(secondHomeowner, artisan, { inspectionWindow: first.inspectionWindow });
    const results = await Promise.all([
      h.request("POST", `${base}/${first.id}/accept`, { actor: artisan, body: { inspectionFee: fee } }),
      h.request("POST", `${base}/${second.id}/accept`, { actor: artisan, body: { inspectionFee: fee }, server: secondServer }),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const records = await Promise.all([detail(first.id), detail(second.id, secondHomeowner, secondServer)]);
    assert.equal(records.filter((record) => record.inspection?.state === "reserved").length, 1);
    assert.equal(records.filter((record) => record.status === "pending").length, 1);
    crossProcess = { first, second, secondServer };
    const adjacentWindow = {
      start: first.inspectionWindow.end,
      end: new Date(Date.parse(first.inspectionWindow.end) + hour).toISOString(),
    };
    const adjacent = await create(homeowner, artisan, { inspectionWindow: adjacentWindow });
    await accept(adjacent, artisan, secondServer);
    assert.equal((await detail(adjacent.id)).inspection.state, "reserved");
  });

  await h.scenario("X01", "Observe the same scheduling winner and participant data through both API processes", async () => {
    for (const [booking, actor] of [[crossProcess.first, homeowner], [crossProcess.second, secondHomeowner]]) {
      sameBooking(await detail(booking.id, actor), await detail(booking.id, actor, crossProcess.secondServer));
    }
    await h.request("GET", `${base}/${crossProcess.first.id}`, { actor: stranger, status: 404, server: crossProcess.secondServer });
  });

  await h.scenario("F13", "Create independent simultaneous reservations on different artisans", async () => {
    const first = await create();
    const second = await create(secondHomeowner, otherArtisan, { inspectionWindow: first.inspectionWindow });
    const responses = await Promise.all([accept(first), accept(second, otherArtisan)]);
    assert.deepEqual(responses.map((result) => result.status), [200, 200]);
    assert.equal((await detail(first.id)).inspection.state, "reserved");
    assert.equal((await detail(second.id, secondHomeowner)).inspection.state, "reserved");
  });

  await h.scenario("F14", "Keep unresolved booking obligations from being bypassed by deletion or role changes", async () => {
    const before = await detail(original.id);
    await h.request("DELETE", "/api/v1/users/me", { actor: homeowner, body: { password: homeowner.password }, status: 409 });
    await h.request("DELETE", `/api/v1/admin/user/${homeowner.id}`, { actor: admin, status: 409 });
    await h.request("PATCH", `/api/v1/admin/user/${homeowner.id}/soft-delete`, { actor: admin, status: 409 });
    await h.request("PATCH", `/api/v1/admin/user/${homeowner.id}`, { actor: admin, body: { role: "artisan" }, status: 409 });
    const personal = await h.request("GET", "/api/v1/users/me", { actor: homeowner, status: 200 });
    assert.equal(personal.body.data.role, "house_owner");
    const administrative = await h.request("GET", `/api/v1/admin/user/${homeowner.id}`, { actor: admin, status: 200 });
    assert.equal(administrative.body.data.isDeleted, false);
    assert.equal(administrative.body.data.role, "house_owner");
    await h.request("GET", "/api/v1/users/me", { actor: artisan, status: 200 });
    sameBooking(before, await detail(original.id));
  });

  await h.scenario("F15", "Enforce authentication and API rate limits on a separately configured server", async () => {
    const authServer = await h.startServer({ authLimit: 2 });
    const badLogin = { email: homeowner.email, password: "IncorrectPass123" };
    await h.request("POST", "/api/v1/auth/login", { body: badLogin, status: 401, server: authServer });
    await h.request("POST", "/api/v1/auth/login", { body: badLogin, status: 401, server: authServer });
    const authLimited = await h.request("POST", "/api/v1/auth/login", { body: badLogin, status: 429, server: authServer });
    assert.ok(authLimited.headers.get("ratelimit") || authLimited.headers.get("ratelimit-limit"));
    const apiServer = await h.startServer({ apiLimit: 3 });
    await h.request("GET", base, { actor: homeowner, status: 200, server: apiServer });
    await h.request("GET", base, { actor: homeowner, status: 200, server: apiServer });
    await h.request("GET", base, { actor: homeowner, status: 200, server: apiServer });
    const apiLimited = await h.request("GET", base, { actor: homeowner, status: 429, server: apiServer });
    assert.ok(apiLimited.headers.get("ratelimit") || apiLimited.headers.get("ratelimit-limit"));
    await h.request("GET", `${base}/${original.id}`, { status: 401 });
  });

  await h.scenario("X02", "Honor an independently held account lock and resume safely after exact-token release", async () => {
    const pending = await create();
    const before = await detail(pending.id);
    await h.withLock(artisan.id, "service-request", async () => {
      await action(pending.id, "accept", artisan, { inspectionFee: fee }, 409);
      sameBooking(before, await detail(pending.id));
    });
    await accept(pending);
    assert.equal((await detail(pending.id)).inspection.state, "reserved");
  });

  await h.scenario("J07-fast", "Reconcile a late cancelled-reservation payment without stealing its replacement slot", async () => {
    const cancelled = await create();
    await accept(cancelled);
    await action(cancelled.id, "cancel", homeowner);
    const replacement = await create(secondHomeowner, artisan, { inspectionWindow: cancelled.inspectionWindow });
    await accept(replacement);
    const before = await detail(replacement.id, secondHomeowner);
    const late = await h.pay(event(cancelled.id));
    assert.equal(late.outcome, "reconciliation_required");
    assert.equal((await detail(cancelled.id)).status, "cancelled");
    sameBooking(before, await detail(replacement.id, secondHomeowner));
    await h.request("DELETE", `/api/v1/admin/user/${homeowner.id}`, { actor: admin, status: 409 });
    assert.equal(await h.countPayments(cancelled.id), 1);
  });

  await h.assertNoLocks();
};
