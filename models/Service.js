import mongoose from "mongoose";


const serviceSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        duration: {
            type: Number,
            required: true,
            min: 5,
        },
        price: {
            type: Number,
            default: 0,
            min: 0,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        icon: {
            type: String,
            default: "C1.png"
        },
        isActive: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
)

const Service = mongoose.model("Service", serviceSchema);

export default Service;