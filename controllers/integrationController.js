import User from "../models/User.js";
import { getGoogleAuthUrl, getGoogleTokens } from "../utils/googleCalendar.js";

export const getGoogleConnectUrl = async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return res.status(503).json({ message: "Server calendar integration not configured" })
  }

  res.json({ url: getGoogleAuthUrl(req.user.id) })
}

export const handleGoogleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.redirect(`${process.env.GOOGLE_REDIRECT_URI || "http://localhost:5173"}/profile?calendar=failed`)
    }

    const tokens = await getGoogleTokens(code);

    if (!tokens.refresh_token) {
      return res.redirect(`${process.env.CLIENT_REDIRECT_URI || "http://localhost:5173"}/profile?calendar=missing_refresh_token}`)
    }

    await User.findByIdAndUpdate(state, {
      googleRefreshToken: tokens.refresh_token,
      googleCalendarConnected: true,
      googleCalendarId: "primary",
    });

    res.redirect(`${process.env.CLIENT_REDIRECT_URI || "http://localhost:5173"}/profile?calendar=connected`)
  } catch (error) {
    res.redirect(`${process.env.CLIENT_REDIRECT_URI || "http://localhost:5173"}/profile?calendar=failed`)
  }
}