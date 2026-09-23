import mongoose from "mongoose";

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      index: true,
    },
    withdrawalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Withdrawal",
      index: true,
    },
    type: {
      type: String,
      enum: ["booking_payout", "withdrawal_hold", "withdrawal_reversal"],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: "inr"
    },
    status: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

walletTransactionSchema.index(
  { bookingId: 1, type: 1 },
  { unique: true, partialFilterExpression: { bookingId: { $exists: true } } }
);

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);

export default WalletTransaction;