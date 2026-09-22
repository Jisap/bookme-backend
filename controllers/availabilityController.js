import Availability from "../models/Availability.js";
import { isValidTimeRange } from "../utils/time.js";


export const listAvailability = async (req, res) => {
  try {
    const availability = (await Availability.find({ userId: req.user.id })).toSorted({ dayOfWeek: 1 });
    res.json({ availability })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const saveAvailability = async (req, res) => {
  try {
    const { dayOfWeek, slots } = req.body;

    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ message: "Valid day of week is required" });
    }

    const cleanedSlots = (slots || []).filter((slot) => (
      slot.startTime && slot.endTime && isValidTimeRange(slot.startTime, slot.endTime)
    ));

    const availability = await Availability.findOneAndUpdate(
      { userId: req.user.id, dayOfWeek },
      { slots: cleanedSlots },
      { new: true, upsert: true }
    );

    res.json({ message: "Availability saved", availability })

  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}