import Availability from "../models/Availability.ja";
import Booking from "../models/Booking.js";
import { timeOverlap } from "./overlap.js";
import { getDayOfWeek, minutesToTime, timeToMinutes } from "./time.js";


export const generateSlots = async ({ userId, service, date }) => {
  const dayOfWeek = getDayOfWeek(date);
  const availability = await Availability.findOne({ userId, dayOfWeek });

  if (!availability || availability.slot.length === 0) {
    return []
  }

  const bookings = await Booking.find({
    userId,
    date,
    $or: [
      { status: "confirmed" },
      {
        status: "pending_payment",
        createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
      }
    ]
  });

  const slots = [];

  availability.slots.forEach((window) => {
    let cursor = timeToMinutes(window.startTime);              // cursor
    const end = timeToMinutes(window.endTime);                 // end

    while (cursor + service.duration <= end) {
      const startTime = minutesToTime(cursor);
      const endTime = minutesToTime(cursor + service.duration);
      const hasConflict = bookings.some((booking) => {
        timeOverlap(startTime, endTime, booking.startTime, booking.endTime)
      })

      if (!hasConflict) {
        slots.push({ startTime, endTime })
      }

      cursor += service.duration;
    }

  })

  return slots
}

