import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import { requestEmailOtp, verifyEmailOtp } from "../utils/emailOtp.js"
import slugify from "../utils/slug.js"

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  })
}

const toUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  slug: user.slug,
  businessName: user.businessName,
  businessDescription: user.businessDescription,
  brandTheme: user.brandTheme,
  brandAccent: user.brandAccent,
  timezone: user.timezone,
  googleCalendarConnected: user.googleCalendarConnected,
  googleCalendarId: user.googleCalendarId,
  payoutDetails: user.payoutDetails,
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
});

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, businessName, businessDescription, timezone, emailOtp } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const otpResult = await verifyEmailOtp({
      email: normalizedEmail,
      purpose: "registration",
      code: emailOtp,
      consume: true,
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Email verification is required" })
    }

    const baseSlug = slugify(businessName || name) || "bussiness";
    let finalSlug = baseSlug;
    let counter = 1;

    while (await User.findOne({ slug: finalSlug })) {
      finalSlug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashPassword,
      slug: finalSlug,
      businessName: businessName || "",
      timezone
    });

    const token = createToken(user._id);

    res.status(201).json({
      message: "Registration successful",
      token,
      user: toUserResponse(user),
    });

  } catch (err) {
    console.log("Registration failed", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

export const requestRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" })
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" })
    }

    const result = await requestEmailOtp({
      email: normalizedEmail,
      purpose: "registration"
    });

    res.json({
      message: "Verification code sent to your email", result
    })

  } catch (err) {
    console.log("Error requesting registration OTP", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

export const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, emailOtp } = req.body
    const normalizedEmail = email?.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email OTP are required" })
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" })
    }

    const otpResult = await verifyEmailOtp({
      email: normalizedEmail,
      purpose: "registration",
      code: emailOtp,
      consume: true,
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Invalid OTP" })
    }

    res.json({
      message: "OTP verified",
    })
  } catch (err) {
    console.log("Error verifying registration OTP", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" })
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const token = createToken(user._id);

    res.json({
      message: "Logged in sucessfully",
      token,
      user: toUserResponse(user)
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}