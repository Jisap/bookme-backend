import mongoose from "mongoose";

const withdrawlSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
    },
    currency: {
        type: String,
        default: "inr"
    },
    status: {
        type: String,
        enum: ["pending", "processing", "paid", "rejected"],
        default: "pending",
        index: true
    },
    payoutSnapshot: {
        accountHolderName: String,
        bankName: String,
        accountLast4: String,
        ifsc: String,
        upiId: String,
    },
    adminNote: {
        type: String,
        default: "",
        trim: true,
    },
},
    { timestamps: true }
);

const Withdrawl = mongoose.model("Withdrawl", withdrawlSchema);

export default Withdrawl;