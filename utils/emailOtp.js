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

export const verifyEmailOtp = async ({ email, purpose, code, consume = false }) => {
  const normalizedEmail = normalizedEmail(email);
  if (!normalizedEmail || !code) {
    return { verified: false, reason: "Email and OTP are required" }
  }

  const record = await EmailOtp.findOne({
    email: normalizedEmail,
    consumeAt: null,
    expireAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (!record) {
    return { verified: false, reason: "OTP expired or not found" }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { verified: false, reason: "Too many OTP attempts. Request a new code." }
  }

  const isMatch = await bcrypt.compare(String(code).trim(), record.codeHash)
  if (!isMatch) {
    record.attempts += 1;
    await record.save();
    return { verified: false, reason: "Invalid OTP" }
  }

  if (consume) {
    record.consumeAt = new Date();
    await record.save();
  }

  return {
    verified: true,
    email: normalizedEmail
  }
}
