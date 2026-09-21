import bcrypt from "bcryptjs";
import crypto from "crypto";
import EmailOtp from "../models/EmailOtp";
import { sendOtpNotification } from "./bookingNotifications";

const OTP_TTL_MINUTES = 10; // OTP life in minutes
const MAX_ATTEMPTS = 5;     // Max attemps to verify OTP

const normalizedEmail = (email = "") => email.toLocaleLowerCase().trim(); // Email normalizer

const createCode = () => crypto.randomInt(100000, 1000000).toString();    // OTP generator

export const requestEmailOtp = async ({ email, purpose }) => {
  const normalizedEmail = normalizedEmail(email);
  if (!normalizedEmail) {
    throw new Error("Email is required")
  }

  const code = createCode();                                                               // create code
  const codeHash = await bcrypt.hash(code, 10);                                            // hash code
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);                    // expire time

  await EmailOtp.deleteMany({ email: normalizedEmail, purpose, consumeAt: null });         // delete old OTPs
  await EmailOtp.create({                                                                  // create new OTP
    email: normalizedEmail,
    purpose,
    codeHash,
    expiresAt,
  });

  await sendOtpNotification({ email: normalizedEmail, code, purpose });                     // send email with OTP 

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

  const record = await EmailOtp.findOne({                                                   // find OTP record
    email: normalizedEmail,
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
    email: normalizedEmail
  }
}
