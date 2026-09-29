import assert from "node:assert/strict";
import { test } from "node:test";
import { addInterval, isClosedStatus, isIsoDate, normalizeRecurrence, RecurrenceError, reminderDate, sameRecurrence, todayInZurich } from "../server/recurrence.ts";

test("intervals are added in days, weeks and calendar months", () => {
  assert.equal(addInterval("2026-10-01", 12, "days"), "2026-10-13");
  assert.equal(addInterval("2026-12-25", 10, "days"), "2027-01-04");
  assert.equal(addInterval("2026-10-01", 2, "weeks"), "2026-10-15");
  assert.equal(addInterval("2026-10-15", 3, "months"), "2027-01-15");
  assert.equal(addInterval("2026-01-31", 1, "months"), "2026-02-28", "day is capped at the end of the month");
  assert.equal(addInterval("2028-01-31", 1, "months"), "2028-02-29");
  assert.equal(addInterval("2026-03-29", 1, "days"), "2026-03-30", "daylight saving time does not shift the date");
});

test("reminder dates count back from the planned date", () => {
  assert.equal(reminderDate("2026-10-20", { remindBefore: 7, remindUnit: "days" }), "2026-10-13");
  assert.equal(reminderDate("2026-10-20", { remindBefore: 1, remindUnit: "weeks" }), "2026-10-13");
  assert.equal(reminderDate("2026-03-31", { remindBefore: 1, remindUnit: "months" }), "2026-02-28");
  assert.equal(reminderDate("2026-10-20", { remindBefore: 0, remindUnit: "days" }), "2026-10-20");
});

test("recurrence is validated and normalized", () => {
  assert.equal(normalizeRecurrence(null), null);
  assert.equal(normalizeRecurrence(undefined), null);
  assert.deepEqual(normalizeRecurrence({ every: 12, unit: "days", remindBefore: 7, remindUnit: "days", managerId: "emp-admin" }), { every: 12, unit: "days", remindBefore: 7, remindUnit: "days", managerId: "emp-admin" });
  assert.deepEqual(normalizeRecurrence({ every: "3", unit: "months" }), { every: 3, unit: "months", remindBefore: 0, remindUnit: "days", managerId: "" });
  for (const bad of [
    { every: 0, unit: "days" },
    { every: 1.5, unit: "days" },
    { every: 12, unit: "years" },
    { every: 121, unit: "months" },
    { every: 12, unit: "days", remindBefore: -1 },
    { every: 12, unit: "days", remindUnit: "hours" },
    "12 days",
    [12, "days"],
  ]) {
    assert.throws(() => normalizeRecurrence(bad), RecurrenceError, JSON.stringify(bad));
  }
});

test("dates, statuses and recurrence comparison", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("28.02.2026"), false);
  assert.equal(isClosedStatus("Erledigt"), true);
  assert.equal(isClosedStatus("Abgeschlossen"), true);
  assert.equal(isClosedStatus("In Arbeit"), false);
  assert.equal(sameRecurrence({ unit: "days", every: 12, remindBefore: 7, remindUnit: "days", managerId: "a" }, { every: 12, unit: "days", remindBefore: 7, remindUnit: "days", managerId: "a" }), true);
  assert.equal(sameRecurrence(null, { every: 12, unit: "days" }), false);
  assert.match(todayInZurich(new Date("2026-12-31T23:30:00Z")), /^2027-01-01$/, "Swiss date, not UTC");
});
