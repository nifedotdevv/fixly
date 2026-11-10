import ServiceRequest from "../../models/serviceRequest.js";
import { requireCondition } from "./rules.js";

export const assertAvailability = async (record, window) => {
  const overlap = (kind) => ({
    [`${kind}.window.start`]: { $lt: window.end },
    [`${kind}.window.end`]: { $gt: window.start },
    $or: [
      { [`${kind}.state`]: "confirmed" },
      { [`${kind}.state`]: "reserved", $expr: { $gt: [`$${kind}.paymentDeadline`, "$$NOW"] } },
    ],
  });
  // Every caller holds the artisan account lock through this check AND the subsequent request save.
  const conflict = await ServiceRequest.exists({
    artisan: record.artisan, _id: { $ne: record._id },
    $or: [overlap("inspection"), overlap("repair")],
  });
  requireCondition(!conflict, "The artisan already has a reservation or appointment overlapping this window");
};
export const reserve = async (record, kind, window, duration, now, cutoff = window.start) => {
  await assertAvailability(record, window);
  const paymentDeadline = new Date(Math.min(now.getTime() + duration, cutoff.getTime(), window.start.getTime()));
  requireCondition(paymentDeadline > now, "The payment reservation window has expired");
  record[kind] = { window, state: "reserved", paymentDeadline };
};
