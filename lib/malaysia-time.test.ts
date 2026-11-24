import { expect, it } from "vitest";
import { parseScheduleValue, scheduleValue } from "./malaysia-time";

it("converts admin schedule inputs to UTC independently of server local time", () => {
  const date = parseScheduleValue("2026-11-24T09:12");
  expect(date?.toISOString()).toBe("2026-11-24T01:12:00.000Z");
  expect(scheduleValue(new Date("2026-11-24T16:12:05Z"))).toBe("2026-11-25T00:12:05");
  expect(parseScheduleValue("2026-02-31T09:12")).toBeNull();
  expect(parseScheduleValue("2026-11-24T01:12Z")).toBeNull();
});
