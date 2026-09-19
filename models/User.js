import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    businessName: {
      type: String,
      default: "",
      trim: true,
    },
    businessDescription: {
      type: String,
      default: "",
      trim: true,
    },
    brandTheme: {
      type: String,
      enum: ["emerald", "indigo", "rose", "amber", "slate"],
      default: "emerald"
    },
    brandAccent: {
      type: String,
      default: "#047857"
    },
    timezone: {
      type: String,
      default: "UTC-5"
    },
    googleRefreshToken: {
      type: String,
      default: "",
    },
    googleCalendarConnected: {
      type: Boolean,
      default: false
    },
    googleCalendarId: {
      type: String,
      default: "primary"
    },
    payoutDetails: {
      accountHolderName: {
        type: String,
        default: "",
        trim: true,
      },
      bankName: {
        type: String,
        default: "",
        trim: true,
      },
      accountLast4: {
        type: String,
        default: "",
      },
      ifsc: {
        type: String,
        default: "",
        trim: true,
        uppercase: true,
      },
      upiId: {
        type: String,
        default: "",
        trim: true,
      },
      isComplete: {
        type: Boolean,
        default: false
      },
      updatedAt: {
        type: Date,
      }
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;