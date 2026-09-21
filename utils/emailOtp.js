import bcrypt from "bcryptjs";
import crypto from "crypto";
import EmailOtp from "../models/EmailOtp";
import { sendOtpNotification } from "./bookingNotifications";

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const normalizedEmail = (email = "") => email.toLocaleLowerCase().trim();

const createCode = () => crypto.randomInt(100000, 1000000).toString();

export const requestEmailOtp = async ({ email, purpose }) => {
    const normalizedEmail = normalizedEmail(email);
    if (!normalizedEmail) {
        throw new Error("Email is required")
    }

    const code = createCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await EmailOtp.deleteMany({ email: normalizedEmail, purpose, consumeAt: null });
    await EmailOtp.create({
        email: normalizedEmail,
        purpose,
        codeHash,
        expiresAt,
    });

    await sendOtpNotification({ email: normalizedEmail, code, purpose });

    return {
        sent: true,
        email: normalizedEmail,
        expiresInMinutes: OTP_TTL_MINUTES,
    }
}
