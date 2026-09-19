import mongoose from "mongoose";

const emailOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    purpose: {
      type: String,
      enum: ["registration", "booking"]
    },
    codeHash: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expireAt: {
      type: Date,
      required: true,
      index: { expire: 0 }
    },
    consumeAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const EmailOtp = mongoose.model("EmailOtp", emailOtpSchema);
export default EmailOtp;