import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { waitForServerTime, waitUntil } from "./helpers/time.js";

const BASE = "/api/v1/service-requests";
const INSPECTION_AMOUNT = 2500;
const REPAIR_AMOUNT = 10001;
const CURRENCY = "NGN";
const iso = (value) => new Date(value).toISOString();
const path = (booking, suffix = "") => `${BASE}/${booking.id}${suffix}`;
const data = (response) => response.body.data;
const view = async (h, booking, actor = booking.owner) => data(await h.request("GET", path(booking), { actor, status: 200 }));
const action = async (h, booking, suffix, actor, body = {}, status = 200, server = 0) =>
  h.request("POST", path(booking, suffix), { actor, body, status, server });
const assertPaymentHidden = (booking) => {
  for (const payment of booking.payments) assert.equal(payment.externalReference, undefined);
};
const payment = (h, booking, purpose, amount, externalReference = `scenario:${randomUUID()}`) => h.pay({
  requestId: booking.id, purpose, amount, currency: CURRENCY, externalReference,
});

const createBooking = async (h, owner, artisan, window, deadline, label) => {
  const response = await h.request("POST", BASE, {
    actor: owner, status: 201,
    body: {
      artisan: artisan.id, description: `Scenario repair: ${label}`,
      serviceAddress: `Synthetic scenario address ${label}`,
      inspectionWindow: { start: iso(window.start), end: iso(window.end) },
      responseDeadline: iso(deadline),
    },
  });
  const booking = { ...data(response), owner, artisan };
  assert.equal(booking.status, "pending");
  return booking;
};

const acceptInspection = async (h, booking, { paid = true } = {}) => {
  const accepted = data(await action(h, booking, "/accept", booking.artisan, {
    inspectionFee: { amount: INSPECTION_AMOUNT, currency: CURRENCY },
  }));
  assert.equal(accepted.status, "awaiting_inspection_payment");
  assert.equal(accepted.inspection.state, "reserved");
  assert.ok(Date.parse(accepted.inspection.paymentDeadline) <= Date.parse(accepted.inspection.window.start));
  if (paid) {
    assert.equal((await payment(h, booking, "inspection", INSPECTION_AMOUNT)).outcome, "applied");
    assert.equal((await view(h, booking)).status, "inspection_confirmed");
  }
};

const submitQuote = async (h, booking, window, expiresAt) => {
  const quoted = data(await action(h, booking, "/quote", booking.artisan, {
    scope: "Replace damaged fittings and test the repair",
    total: { amount: REPAIR_AMOUNT, currency: CURRENCY },
    repairWindow: { start: iso(window.start), end: iso(window.end) },
    expiresAt: iso(expiresAt),
  }));
  assert.equal(quoted.status, "quote_submitted");
  assert.equal(quoted.quote.depositAmount, 7001);
  assert.equal(quoted.quote.balanceAmount, 3000);
  assert.equal(quoted.quote.depositAmount + quoted.quote.balanceAmount, REPAIR_AMOUNT);
  booking.quote = quoted.quote;
  return quoted;
};

const approveAndPay = async (h, booking) => {
  const approved = data(await action(h, booking, "/quote/approve", booking.owner));
  assert.equal(approved.status, "awaiting_repair_deposit");
  assert.equal(approved.repair.state, "reserved");
  assert.equal((await payment(h, booking, "repair_deposit", booking.quote.depositAmount)).outcome, "applied");
  assert.equal((await view(h, booking)).status, "repair_confirmed");
};

const finishRepair = async (h, booking) => {
  await action(h, booking, "/repair/start", booking.owner, {}, 403);
  assert.equal((await view(h, booking)).status, "repair_confirmed");
  assert.equal(data(await action(h, booking, "/repair/start", booking.artisan)).status, "repair_in_progress");
  await action(h, booking, "/repair/start", booking.artisan, {}, 409);
  await action(h, booking, "/repair/complete", booking.owner, {}, 403);
  assert.equal(data(await action(h, booking, "/repair/complete", booking.artisan)).status, "awaiting_homeowner_confirmation");
  await action(h, booking, "/repair/complete", booking.artisan, {}, 409);
};

const completeHappyPath = async (h, booking) => {
  await waitForServerTime(h, booking.quote.window.start, { label: "confirmed repair start" });
  await finishRepair(h, booking);
  await action(h, booking, "/completion/confirm", booking.artisan, {}, 403);
  const confirmed = data(await action(h, booking, "/completion/confirm", booking.owner));
  assert.equal(confirmed.status, "awaiting_final_payment");
  await action(h, booking, "/completion/confirm", booking.owner, {}, 409);
  const beforeBalance = await view(h, booking);
  assert.equal(beforeBalance.payments.length, 2);
  assert.equal(beforeBalance.status, "awaiting_final_payment");
  const reference = `scenario:${randomUUID()}`;
  assert.equal((await payment(h, booking, "repair_balance", booking.quote.balanceAmount, reference)).outcome, "applied");
  assert.equal((await payment(h, booking, "repair_balance", booking.quote.balanceAmount, reference)).outcome, "applied");
  const completed = await view(h, booking);
  assert.equal(completed.status, "completed");
  assert.equal(completed.repair.state, "completed");
  assert.equal(completed.payments.length, 3);
  assert.equal(completed.payments.filter((entry) => entry.purpose.startsWith("repair_")).reduce((sum, entry) => sum + entry.amount, 0), REPAIR_AMOUNT);
  assertPaymentHidden(completed);
  assert.equal(await h.countPayments(booking.id), 3);
  return completed;
};

const runDefaultJourney = async (h) => h.scenario("D01", "Full booking journey using untouched production-default timing", async () => {
  const owner = await h.actor("house_owner");
  const artisan = await h.actor("artisan");
  const origin = h.now();
  const start = origin + 15 * 60_000 + 20_000;
  const booking = await createBooking(h, owner, artisan, { start, end: start + 5000 }, origin + 15 * 60_000 + 10_000, "default-time");
  await acceptInspection(h, booking);
  await action(h, booking, "/inspection/complete", artisan, {}, 409);
  await waitForServerTime(h, booking.inspectionWindow.end, { label: "default-config inspection end" });
  await action(h, booking, "/inspection/complete", owner, {}, 403);
  assert.equal(data(await action(h, booking, "/inspection/complete", artisan)).status, "inspection_completed");
  const repairStart = h.now() + 20_000;
  await submitQuote(h, booking, { start: repairStart, end: repairStart + 30_000 }, repairStart - 2000);
  await approveAndPay(h, booking);
  await action(h, booking, "/repair/start", artisan, {}, 409);
  await completeHappyPath(h, booking);
});

export const runJourneys = async (h, { defaults = false } = {}) => {
  if (defaults) return runDefaultJourney(h);
  const bookings = {};
  let owners;
  let artisans;
  let secondServer;
  let repairStart;

  await h.scenario("J-setup", "Provision actors and advance independent inspections through actual time gates", async () => {
    // Provision before choosing timestamps so bcrypt/network setup cannot consume a booking deadline.
    owners = {
      happy: await h.actor("house_owner"),
      shared: await h.actor("house_owner"),
      second: await h.actor("house_owner"),
      admin: await h.actor("admin"),
    };
    artisans = {};
    for (const name of ["happy", "decline", "cancel", "problem", "quoteExpiry", "repairExpiry", "conflict", "inspectionExpiry"]) {
      artisans[name] = await h.actor("artisan");
    }
    secondServer = await h.startServer();
    const origin = h.now();
    const window = { start: origin + 95_000, end: origin + 100_000 };
    const adjacent = { start: window.end, end: window.end + 5000 };
    const deadline = origin + 85_000;
    for (const name of ["happy", "decline", "cancel", "problem", "quoteExpiry", "repairExpiry"]) {
      bookings[name] = await createBooking(h, name === "happy" ? owners.happy : owners.shared, artisans[name], window, deadline, name);
    }
    bookings.cancelReplacement = await createBooking(h, owners.shared, artisans.cancel, adjacent, deadline, "cancel-replacement");
    bookings.repairReplacement = await createBooking(h, owners.shared, artisans.repairExpiry, adjacent, deadline, "repair-expiry-replacement");
    bookings.conflictA = await createBooking(h, owners.shared, artisans.conflict, window, deadline, "conflict-a");
    bookings.conflictB = await createBooking(h, owners.second, artisans.conflict, adjacent, deadline, "conflict-b");
    bookings.inspectionExpiry = await createBooking(h, owners.shared, artisans.inspectionExpiry, window, deadline, "unpaid-inspection");
    bookings.responseExpiry = await createBooking(h, owners.shared, artisans.inspectionExpiry, adjacent, deadline, "unanswered");
    bookings.inspectionReuse = await createBooking(h, owners.shared, artisans.inspectionExpiry, {
      start: origin + 240_000, end: origin + 245_000,
    }, deadline, "future-expiring-slot");

    for (const [name, booking] of Object.entries(bookings)) {
      if (["responseExpiry", "inspectionExpiry", "inspectionReuse"].includes(name)) continue;
      await acceptInspection(h, booking);
    }
    await acceptInspection(h, bookings.inspectionExpiry, { paid: false });
    await acceptInspection(h, bookings.inspectionReuse, { paid: false });
    await action(h, bookings.happy, "/inspection/complete", owners.happy, {}, 403);
    await action(h, bookings.happy, "/inspection/complete", artisans.happy, {}, 409);
    assert.equal((await view(h, bookings.happy)).status, "inspection_confirmed");
    await waitForServerTime(h, adjacent.end, { label: "all confirmed inspection windows to end" });
    for (const [name, booking] of Object.entries(bookings)) {
      if (["responseExpiry", "inspectionExpiry", "inspectionReuse"].includes(name)) continue;
      const completed = data(await action(h, booking, "/inspection/complete", booking.artisan));
      assert.equal(completed.status, "inspection_completed");
    }

    repairStart = h.now() + 25_000;
    const repairWindow = { start: repairStart, end: repairStart + 30_000 };
    for (const name of ["happy", "decline", "cancel", "cancelReplacement", "problem"]) {
      await submitQuote(h, bookings[name], repairWindow, repairStart - 2000);
    }
    const quoteExpiry = h.now() + 15_000;
    await submitQuote(h, bookings.quoteExpiry, repairWindow, quoteExpiry);
    const expiryRepairWindow = { start: h.now() + 95_000, end: h.now() + 125_000 };
    await submitQuote(h, bookings.repairExpiry, expiryRepairWindow, quoteExpiry);
    await submitQuote(h, bookings.repairReplacement, expiryRepairWindow, expiryRepairWindow.start - 2000);
    const repairReservation = data(await action(h, bookings.repairExpiry, "/quote/approve", owners.shared));
    assert.equal(repairReservation.status, "awaiting_repair_deposit");
    assert.ok(Date.parse(repairReservation.repair.paymentDeadline) <= quoteExpiry);
    // Longer future windows let new inspection requests meet the real one-minute response minimum.
    const conflictWindow = { start: h.now() + 95_000, end: h.now() + 125_000 };
    await submitQuote(h, bookings.conflictA, conflictWindow, conflictWindow.start - 2000);
    await submitQuote(h, bookings.conflictB, conflictWindow, conflictWindow.start - 2000);
    await approveAndPay(h, bookings.happy);
    await approveAndPay(h, bookings.problem);
    await action(h, bookings.happy, "/repair/start", bookings.happy.artisan, {}, 409);
    assert.equal((await view(h, bookings.happy)).status, "repair_confirmed");
  });

  await h.scenario("J02", "Quote decline preserves paid inspection history and immutable submitted terms", async () => {
    const booking = bookings.decline;
    const before = await view(h, booking);
    await action(h, booking, "/quote", booking.artisan, {
      scope: "Attempted replacement quote", total: { amount: 9999, currency: CURRENCY },
      repairWindow: { start: iso(repairStart), end: iso(repairStart + 40_000) }, expiresAt: iso(repairStart - 2000),
    }, 409);
    await action(h, booking, "/quote/decline", booking.artisan, {}, 403);
    const declined = data(await action(h, booking, "/quote/decline", booking.owner));
    assert.equal(declined.status, "repair_not_proceeding");
    assert.equal(declined.inspection.state, "completed");
    assert.equal(declined.payments.length, 1);
    assert.equal(declined.quote.total.amount, before.quote.total.amount);
    assert.deepEqual(declined.quote.window, before.quote.window);
    await action(h, booking, "/repair/start", booking.artisan, {}, 409);
    await action(h, booking, "/quote/decline", booking.owner, {}, 409);
  });

  await h.scenario("J03", "Cancel unpaid repair reservation and reuse its slot without erasing inspection history", async () => {
    const booking = bookings.cancel;
    await action(h, booking, "/quote/approve", booking.artisan, {}, 403);
    assert.equal(data(await action(h, booking, "/quote/approve", booking.owner)).status, "awaiting_repair_deposit");
    await action(h, booking, "/quote/approve", booking.owner, {}, 409);
    await action(h, booking, "/cancel", booking.artisan, {}, 403);
    const cancelled = data(await action(h, booking, "/cancel", booking.owner));
    assert.equal(cancelled.status, "repair_not_proceeding");
    assert.equal(cancelled.repair.state, "released");
    assert.equal(cancelled.inspection.state, "completed");
    assert.equal(cancelled.payments.length, 1);
    assert.equal(data(await action(h, bookings.cancelReplacement, "/quote/approve", owners.shared)).status, "awaiting_repair_deposit");
  });

  await h.scenario("J08", "Two API processes serialize repair approval and protect overlapping inspection windows", async () => {
    const pair = [bookings.conflictA, bookings.conflictB];
    const results = await Promise.all(pair.map((booking, index) => h.request("POST", path(booking, "/quote/approve"), {
      actor: booking.owner, body: {}, server: index ? secondServer : 0,
    })));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    const winner = pair[results.findIndex((result) => result.status === 200)];
    const loser = pair[results.findIndex((result) => result.status === 409)];
    assert.equal((await view(h, winner)).status, "awaiting_repair_deposit");
    assert.equal((await view(h, loser)).status, "quote_submitted");
    const start = Date.parse(winner.quote.window.start);
    const end = Date.parse(winner.quote.window.end);
    const overlapping = await createBooking(h, owners.second, artisans.conflict, { start, end }, h.now() + 65_000, "overlapping-inspection");
    await action(h, overlapping, "/accept", artisans.conflict, { inspectionFee: { amount: INSPECTION_AMOUNT, currency: CURRENCY } }, 409);
    assert.equal((await view(h, overlapping)).status, "pending");
    assert.equal((await payment(h, winner, "repair_deposit", winner.quote.depositAmount)).outcome, "applied");
    await action(h, overlapping, "/accept", artisans.conflict, { inspectionFee: { amount: INSPECTION_AMOUNT, currency: CURRENCY } }, 409, secondServer);
    await action(h, loser, "/quote/approve", loser.owner, {}, 409);
    const adjacent = await createBooking(h, owners.second, artisans.conflict, { start: end, end: end + 5000 }, h.now() + 65_000, "adjacent-inspection");
    await acceptInspection(h, adjacent, { paid: false });
    await action(h, overlapping, "/cancel", owners.second);
    await action(h, adjacent, "/cancel", owners.second);
  });

  await h.scenario("J07", "Late cancelled deposit reconciles without reclaiming a replacement reservation", async () => {
    const replacementBefore = await view(h, bookings.cancelReplacement);
    const result = await payment(h, bookings.cancel, "repair_deposit", bookings.cancel.quote.depositAmount);
    assert.equal(result.outcome, "reconciliation_required");
    const old = await view(h, bookings.cancel);
    const replacementAfter = await view(h, bookings.cancelReplacement);
    assert.equal(old.status, "repair_not_proceeding");
    assert.equal(old.repair.state, "released");
    assert.equal(old.payments.length, 1);
    assert.equal(replacementAfter.status, "awaiting_repair_deposit");
    assert.deepEqual(replacementAfter.repair, replacementBefore.repair);
    await h.request("DELETE", `/api/v1/admin/user/${artisans.cancel.id}`, { actor: owners.admin, status: 409 });
    assert.equal((await h.request("GET", "/api/v1/users/me", { actor: artisans.cancel, status: 200 })).body.data.id, artisans.cancel.id);
  });

  await h.scenario("J05", "Unanswered and unpaid inspections expire without a maintenance job", async () => {
    await waitUntil(() => view(h, bookings.responseExpiry), (record) => record.status === "response_expired", {
      signal: h.signal, label: "response expiry",
    });
    assert.equal((await view(h, bookings.inspectionExpiry)).status, "inspection_payment_expired");
    await action(h, bookings.responseExpiry, "/accept", artisans.inspectionExpiry, {
      inspectionFee: { amount: INSPECTION_AMOUNT, currency: CURRENCY },
    }, 409);
    await action(h, bookings.responseExpiry, "/notes", owners.shared, { text: "Too late to clarify" }, 409);
    assert.equal((await payment(h, bookings.inspectionExpiry, "inspection", INSPECTION_AMOUNT)).outcome, "reconciliation_required");
    const expiredFuture = await view(h, bookings.inspectionReuse);
    assert.equal(expiredFuture.status, "inspection_payment_expired");
    assert.ok(Date.parse(expiredFuture.inspection.window.start) > h.now() + 65_000);
    const replacement = await createBooking(h, owners.shared, artisans.inspectionExpiry, {
      start: Date.parse(expiredFuture.inspection.window.start), end: Date.parse(expiredFuture.inspection.window.end),
    }, h.now() + 65_000, "reuse-identical-expired-slot");
    await acceptInspection(h, replacement, { paid: false });
    await action(h, replacement, "/cancel", owners.shared);
    assert.equal((await view(h, bookings.inspectionExpiry)).status, "inspection_payment_expired");
  });

  await h.scenario("J06", "Quotes and unpaid repair reservations enforce their real expiry deadlines", async () => {
    const reserved = await view(h, bookings.repairExpiry);
    assert.ok(Date.parse(reserved.repair.paymentDeadline) <= Date.parse(reserved.quote.expiresAt));
    await waitUntil(() => view(h, bookings.quoteExpiry), (record) => record.status === "quote_expired", {
      signal: h.signal, label: "quote expiry", timeoutMs: 15_000,
    });
    await action(h, bookings.quoteExpiry, "/quote/approve", owners.shared, {}, 409);
    await action(h, bookings.quoteExpiry, "/quote/decline", owners.shared, {}, 409);
    const expired = await view(h, bookings.repairExpiry);
    assert.equal(expired.status, "repair_payment_expired");
    assert.equal(expired.repair.state, "expired");
    assert.ok(Date.parse(expired.repair.window.start) > h.now());
    const replacement = data(await action(h, bookings.repairReplacement, "/quote/approve", owners.shared));
    assert.equal(replacement.status, "awaiting_repair_deposit");
    assert.deepEqual(replacement.repair.window, expired.repair.window);
    assert.equal((await payment(h, bookings.repairExpiry, "repair_deposit", bookings.repairExpiry.quote.depositAmount)).outcome, "reconciliation_required");
    assert.deepEqual((await view(h, bookings.repairReplacement)).repair, replacement.repair);
    await action(h, bookings.repairExpiry, "/repair/start", artisans.repairExpiry, {}, 409);
  });

  await h.scenario("J01", "Inspection, quote, verified deposit, repair, confirmation and final balance complete over HTTP", async () => {
    await completeHappyPath(h, bookings.happy);
    const booking = bookings.happy;
    const reviewed = data(await action(h, booking, "/review", booking.owner, { rating: 5, comment: "Careful repair" }, 201));
    assert.equal(reviewed.review.rating, 5);
    await action(h, booking, "/review", booking.owner, { rating: 1 }, 409);
    const profile = data(await h.request("GET", `/api/v1/artisan/profile/${booking.artisan.profileId}`, { status: 200 }));
    assert.deepEqual(profile.ratingSummary, { count: 1, average: 5 });
    const history = await h.request("GET", `${BASE}?status=completed`, { actor: booking.owner, status: 200 });
    assert.ok(history.body.data.some((record) => record.id === booking.id));
  });

  await h.scenario("J04", "A reported problem blocks normal completion, payment and account removal", async () => {
    const booking = bookings.problem;
    await finishRepair(h, booking);
    await action(h, booking, "/problems", booking.artisan, { explanation: "Wrong participant" }, 403);
    await action(h, booking, "/problems", booking.owner, { explanation: "" }, 400);
    assert.equal((await view(h, booking)).status, "awaiting_homeowner_confirmation");
    const reported = data(await action(h, booking, "/problems", booking.owner, { explanation: "The synthetic test fitting still leaks" }));
    assert.equal(reported.status, "problem_reported");
    assert.equal(reported.problem.explanation, "The synthetic test fitting still leaks");
    await action(h, booking, "/completion/confirm", booking.owner, {}, 409);
    await action(h, booking, "/cancel", booking.owner, {}, 409);
    await assert.rejects(() => payment(h, booking, "repair_balance", booking.quote.balanceAmount), (error) => error.statusCode === 409);
    await h.request("DELETE", `/api/v1/admin/user/${booking.artisan.id}`, { actor: owners.admin, status: 409 });
    assert.equal((await view(h, booking)).status, "problem_reported");
  });

  await h.scenario("J09", "Resolved history retains old identity after account deletion and fresh registration", async () => {
    const booking = bookings.happy;
    await h.request("DELETE", `/api/v1/admin/user/${booking.owner.id}`, { actor: owners.admin, status: 200 });
    await h.request("GET", path(booking), { actor: booking.owner, status: 401 });
    const history = await view(h, booking, booking.artisan);
    assert.equal(history.status, "completed");
    assert.equal(history.homeowner, booking.owner.id);
    assert.equal(history.payments.length, 3);
    assert.equal(await h.countPayments(booking.id), 3);
    const registered = await h.request("POST", "/api/v1/auth/register", {
      status: 201, body: {
        firstName: "Fresh", lastName: "Identity", email: booking.owner.email,
        password: booking.owner.password, role: "house_owner",
      },
    });
    assert.notEqual(registered.body.data.id, booking.owner.id);
    const login = await h.request("POST", "/api/v1/auth/login", {
      status: 200, body: { email: booking.owner.email, password: booking.owner.password },
    });
    const fresh = { token: login.body.data.token };
    await h.request("GET", path(booking), { actor: fresh, status: 404 });
    const list = await h.request("GET", BASE, { actor: fresh, status: 200 });
    assert.equal(list.body.data.length, 0);
    assertPaymentHidden(history);
  });
  await h.assertNoLocks();
};
