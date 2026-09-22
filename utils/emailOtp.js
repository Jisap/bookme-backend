import bcrypt from "bcryptjs";
import crypto from "crypto";
import EmailOtp from "../models/EmailOtp.js";
import { sendOtpNotification } from "./bookingNotifications.js";

const OTP_TTL_MINUTES = 10; // OTP life in minutes
const MAX_ATTEMPTS = 5;     // Max attemps to verify OTP

const normalizeEmail = (email = "") => email.toLowerCase().trim(); // Email normalizer

const createCode = () => crypto.randomInt(100000, 1000000).toString();    // OTP generator

// Genera un código OTP y lo envía al email del usuario.
export const requestEmailOtp = async ({ email, purpose }) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("Email is required")
  }

  const code = createCode();                                                               // create code
  const codeHash = await bcrypt.hash(code, 10);                                            // hash code
  const expireAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);                     // expire time

  await EmailOtp.deleteMany({ email: normalized, purpose, consumeAt: null });              // delete old OTPs
  await EmailOtp.create({                                                                  // create new OTP
    email: normalized,
    purpose,
    codeHash,
    expireAt,
  });

  await sendOtpNotification({ email: normalized, code, purpose });                          // send email with OTP 

  return {
    sent: true,
    email: normalized,
    expiresInMinutes: OTP_TTL_MINUTES,
  }
}

// Verifica el código OTP y lo consume si se desea.
export const verifyEmailOtp = async ({ email, purpose, code, consume = false }) => {
  const normalized = normalizeEmail(email);
  if (!normalized || !code) {
    return { verified: false, reason: "Email and OTP are required" }
  }

  const record = await EmailOtp.findOne({                                                   // find OTP record
    email: normalized,
    purpose,
    consumeAt: null,
    expireAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });                                                               // sort by creation date

  if (!record) {
    return { verified: false, reason: "OTP expired or not found" }                          // OTP not found
  }

  if (record.attempts >= MAX_ATTEMPTS) {                                                    // check attempts
    return { verified: false, reason: "Too many OTP attempts. Request a new code." }
  }

  const isMatch = await bcrypt.compare(String(code).trim(), record.codeHash)                // compare OTP
  if (!isMatch) {                                                                           // OTP not match
    record.attempts += 1;                                                                   // increment attempts
    await record.save();                                                                    // save record
    return { verified: false, reason: "Invalid OTP" }
  }

  if (consume) {                                                                             // consume OTP
    record.consumeAt = new Date();                                                           // set consume time
    await record.save();                                                                     // save record
  }

  return {
    verified: true,
    email: normalized
  }
}
