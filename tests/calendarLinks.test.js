import { describe, it, expect } from "vitest";
import { buildCustomerCalendarUrl } from "../utils/calendarLinks.js";

describe("buildCustomerCalendarUrl", () => {
  it("builds a Google Calendar template URL", () => {
    const url = buildCustomerCalendarUrl({
      business: { businessName: "Mental Clinic" },
      service: { name: "Consultation" },
      booking: { date: "2026-10-06", startTime: "09:00", endTime: "10:00", notes: "" },
    });
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    // dates=20261006T090000/20261006T100000 (URL-encoded)
    expect(url).toContain("20261006T090000");
    expect(url).toContain("20261006T100000");
  });
});
