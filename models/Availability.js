import mongoose from "mongoose";


const SlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const availabilitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    slot: {
      type: [SlotSchema],
      default: []
    }
  },
  { timestamps: true }
);

availabilitySchema.index({ userId: 1, dayOfWeek: 1 }, { unique: true });

const Availability = mongoose.model("Availability", availabilitySchema);

export default Availability;
