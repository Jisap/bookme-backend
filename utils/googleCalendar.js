import { google } from "googleapis";
import { buildCustomerCalendarUrl } from "./calendarLinks.js";

const getOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export const getGoogleAuthUrl = (userId) => {
  const oauth2Client = getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.events"],
    state: String(userId)
  });
}

export const getGoogleTokens = async (code) => {
  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export const createBookingCalendarEvent = async ({ business, service, booking }) => {
  const customerCalendarUrl = buildCustomerCalendarUrl({ business, service, booking });

  if (!business.googleCalendarConnected || !business.googleRefreshToken) {
    return { customerCalendarUrl };
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: business.googleRefreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const summary = `${service.name} - ${booking.customerName}`;
  const description = [
    `Customer: ${booking.customerName}`,
    `Email: ${booking.customerEmail}`,
    booking.notes ? `Notes: ${booking.notes}` : '',
  ].filter(Boolean).join('\n');

  const event = {
    summary,
    description,
    start: {
      dateTime: `${booking.date}T${booking.startTime}:00`,
      timeZone: business.timezone || 'Asia/Kolkata',
    },
    end: {
      dateTime: `${booking.date}T${booking.endTime}:00`,
      timeZone: business.timezone || 'Asia/Kolkata',
    },
    attendees: [{ email: booking.customerEmail }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const { data } = await calendar.events.insert({
    calendarId: business.googleCalendarId || 'primary',
    resource: event,
    sendUpdates: 'all',
  });

  return {
    googleEventId: data.id,
    customerCalendarUrl,
  };
};

export const updateBookingCalendarEvent = async ({ business, service, booking }) => {
  const customerCalendarUrl = buildCustomerCalendarUrl({ business, service, booking });

  if (!business.googleCalendarConnected || !business.googleRefreshToken) {
    return { customerCalendarUrl };
  }

  if (!booking.googleEventId) {
    return createBookingCalendarEvent({ business, service, booking });
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: business.googleRefreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const summary = `${service.name} - ${booking.customerName}`;
  const description = [
    `Customer: ${booking.customerName}`,
    `Email: ${booking.customerEmail}`,
    booking.notes ? `Notes: ${booking.notes}` : '',
  ].filter(Boolean).join('\n');

  const event = {
    summary,
    description,
    start: {
      dateTime: `${booking.date}T${booking.startTime}:00`,
      timeZone: business.timezone || 'Asia/Kolkata',
    },
    end: {
      dateTime: `${booking.date}T${booking.endTime}:00`,
      timeZone: business.timezone || 'Asia/Kolkata',
    },
    attendees: [{ email: booking.customerEmail }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 },
        { method: 'popup', minutes: 30 },
      ],
    },
  };

  const { data } = await calendar.events.update({
    calendarId: business.googleCalendarId || 'primary',
    eventId: booking.googleEventId,
    resource: event,
    sendUpdates: 'all',
  });

  return {
    googleEventId: data.id,
    customerCalendarUrl,
  };
};

export const cancelBookingCalendarEvent = async ({ business, booking }) => {
  if (!business.googleCalendarConnected || !business.googleRefreshToken || !booking.googleEventId) {
    return false;
  }

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: business.googleRefreshToken });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.patch({
    calendarId: business.googleCalendarId || 'primary',
    eventId: booking.googleEventId,
    resource: { status: 'cancelled' },
    sendUpdates: 'all',
  });

  return true;
};