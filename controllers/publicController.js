import Booking from "../models/Booking.js";
import Service from "../models/Service.js";
import User from "../models/User.js";
import { buildCustomerCalendarUrl } from "../utils/calendarLinks.js";
import { createBookingCalendarEvent } from "../utils/googleCalendar.js";
import { sendBookingNotification } from "../utils/bookingNotifications.js";
import { requestEmailOtp, verifyEmailOtp } from "../utils/emailOtp.js";
import { generateSlots } from "../utils/slotGenerator.js";
import { getStripe, toStripeAmount } from "../utils/stripe.js";
import { calculatePlatformSplit } from "../utils/money.js";
import { timesOverlap } from "../utils/overlap.js";
import { createBookingPayoutTransaction } from "../utils/wallet.js";

/**
 * Busca un negocio/proveedor por su slug excluyendo el campo de la contraseña.
 * 
 * @param {string} slug - Slug identificador del negocio
 * @returns {Promise<Object|null>} Documento del usuario/negocio o null
 */
const getBusinessBySlug = async (slug) => {
  return User.findOne({ slug }).select("-password");
};

/**
 * Filtra y estructura los datos públicos de un negocio para ser consumidos por el cliente.
 * 
 * @param {Object} business - Documento del negocio
 * @returns {Object} Objeto con la información pública del perfil del negocio
 */
const toPublicBusiness = (business) => ({
  id: business._id,
  name: business.name,
  slug: business.slug,
  businessName: business.businessName,
  businessDescription: business.businessDescription,
  brandTheme: business.brandTheme,
  brandAccent: business.brandAccent,
  timezone: business.timezone,
  googleCalendarConnected: business.googleCalendarConnected,
});

/**
 * Calcula el timestamp de inicio de la ventana de retención (30 minutos atrás).
 * Se utiliza para considerar reservas pendientes de pago que aún bloquean horarios.
 * 
 * @returns {Date} Fecha límite de inicio de la ventana
 */
const holdWindowStart = () => new Date(Date.now() - 30 * 60 * 1000);

/**
 * Busca reservas activas (confirmadas o pendientes de pago recientes)
 * para un proveedor y una fecha determinada.
 * 
 * @param {Object} params - Parámetros de búsqueda
 * @param {string} params.userId - ID del negocio/proveedor
 * @param {string} params.date - Fecha en formato YYYY-MM-DD
 * @returns {Promise<Array>} Lista de reservas activas
 */
const findActiveSlotBookings = ({ userId, date }) => {
  return Booking.find({
    userId,
    date,
    $or: [
      { status: "confirmed" },
      {
        status: "pending_payment",
        createdAt: { $gte: holdWindowStart() },
      },
    ],
  });
};

/**
 * Obtiene el perfil público de un negocio y su catálogo de servicios activos.
 * 
 * @param {Object} req - Objeto de solicitud de Express (params: slug)
 * @param {Object} res - Objeto de respuesta de Express
 */
export const getPublicBusiness = async (req, res) => {
  try {
    const business = await getBusinessBySlug(req.params.slug);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Obtiene los servicios activos del negocio ordenados alfabéticamente
    const services = await Service.find({
      userId: business._id,
      isActive: true,
      isDeleted: { $ne: true },
    }).sort({ name: 1 });

    res.json({ business: toPublicBusiness(business), services });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Genera y devuelve los slots (turnos/horarios) disponibles para una fecha y servicio concretos.
 * 
 * @param {Object} req - Objeto de solicitud (params: slug, query: date, serviceId)
 * @param {Object} res - Objeto de respuesta
 */
export const getPublicSlots = async (req, res) => {
  try {
    const { date, serviceId } = req.query;

    if (!date || !serviceId) {
      return res.status(400).json({ message: "Date and Service ID are required" });
    }

    const business = await getBusinessBySlug(req.params.slug);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const service = await Service.findOne({
      _id: serviceId,
      userId: business._id,
      isActive: true,
      isDeleted: { $ne: true },
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Calcula los bloques horarios disponibles según disponibilidad del negocio y reservas existentes
    const slots = await generateSlots({ userId: business._id, service, date });

    res.json({ slots });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Solicita el envío de un código OTP al correo electrónico del cliente para verificar su identidad antes de reservar.
 * 
 * @param {Object} req - Objeto de solicitud (params: slug, body: customerEmail)
 * @param {Object} res - Objeto de respuesta
 */
export const requestPublicBookingOtp = async (req, res) => {
  try {
    const { customerEmail } = req.body;
    const normalizedEmail = customerEmail?.toLowerCase().trim();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    const business = await getBusinessBySlug(req.params.slug);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Genera y envía el código OTP mediante el servicio de correo
    await requestEmailOtp({
      email: normalizedEmail,
      purpose: "booking",
    });

    res.json({ message: "Verification code sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Verifica si el código OTP proporcionado por el cliente es válido (sin consumirlo).
 * 
 * @param {Object} req - Objeto de solicitud (body: customerEmail, emailOtp)
 * @param {Object} res - Objeto de respuesta
 */
export const verifyPublicBookingOtp = async (req, res) => {
  try {
    const { customerEmail, emailOtp } = req.body;

    if (!customerEmail || !emailOtp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const otpResult = await verifyEmailOtp({
      email: customerEmail,
      purpose: "booking",
      code: emailOtp,
      consume: false,
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Invalid OTP" });
    }

    res.json({ message: "OTP verified" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Crea una reserva pública.
 * - Valida campos, disponibilidad horaria y OTP del cliente (consumiéndolo).
 * - Si el servicio es gratuito (importe 0): la confirma de inmediato, crea evento en Google Calendar y envía correo.
 * - Si es de pago: crea la sesión de Stripe Checkout y devuelve la URL para completar el pago.
 * 
 * @param {Object} req - Objeto de solicitud (params: slug, body con datos de la reserva)
 * @param {Object} res - Objeto de respuesta
 */
export const createPublicBooking = async (req, res) => {
  try {
    const { serviceId, customerName, customerEmail, customerAvatar, date, startTime, endTime, notes, emailOtp } = req.body;

    if (!serviceId || !customerName || !customerEmail || !date || !startTime || !endTime) {
      return res.status(400).json({ message: "All booking fields are required" });
    }

    const normalizedCustomerEmail = customerEmail.toLowerCase().trim();

    // 1. Validar la existencia del negocio y del servicio
    const business = await getBusinessBySlug(req.params.slug);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const service = await Service.findOne({
      _id: serviceId,
      userId: business._id,
      isActive: true,
      isDeleted: { $ne: true },
    });
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // 2. Comprobar colisión de horarios con otras reservas activas
    const bookings = await findActiveSlotBookings({ userId: business._id, date });
    const hasConflict = bookings.some((booking) => (
      timesOverlap(startTime, endTime, booking.startTime, booking.endTime)
    ));

    if (hasConflict) {
      return res.status(409).json({ message: "That slot is no longer available" });
    }

    // 3. Consumir y validar el código OTP
    const otpResult = await verifyEmailOtp({
      email: normalizedCustomerEmail,
      purpose: "booking",
      code: emailOtp,
      consume: true,
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Email verification is required" });
    }

    // 4. Calcular importes, comisiones y configuración de Stripe
    const amount = toStripeAmount(service.price);
    const { platformFeeAmount, providerPayoutAmount } = calculatePlatformSplit(amount);
    const currency = "inr";
    const stripe = amount > 0 ? getStripe() : null;

    if (amount > 0 && !stripe) {
      return res.status(503).json({ message: "Stripe payments are not configured yet" });
    }

    // 5. Generar enlace de calendario para el cliente
    const customerCalendarUrl = buildCustomerCalendarUrl({
      business,
      service,
      booking: { date, startTime, endTime, customerName, customerEmail: normalizedCustomerEmail, notes },
    });

    // 6. Registrar la reserva en la base de datos
    const booking = await Booking.create({
      userId: business._id,
      serviceId,
      customerName,
      customerEmail: normalizedCustomerEmail,
      customerAvatar: customerAvatar || "A1.png",
      date,
      startTime,
      endTime,
      notes: notes || "",
      amount,
      platformFeeAmount,
      providerPayoutAmount,
      payoutStatus: amount > 0 ? "pending" : "not_required",
      currency,
      paymentStatus: amount > 0 ? "pending" : "not_required",
      status: amount > 0 ? "pending_payment" : "confirmed",
      customerCalendarUrl,
    });

    // 7. Flujo para reservas gratuitas (importe = 0)
    if (amount === 0) {
      try {
        const calendarResult = await createBookingCalendarEvent({ business, service, booking });
        booking.googleEventId = calendarResult.googleEventId || "";
        booking.customerCalendarUrl = calendarResult.customerCalendarUrl;
        await booking.save();
      } catch (calendarError) {
        booking.customerCalendarUrl = customerCalendarUrl;
        await booking.save();
      }

      let emailResult = { sent: "processing" };
      sendBookingNotification({ business, service, booking, type: "confirmed" })
        .catch(emailError => console.error("Booking confirmation email failed:", emailError.message));

      return res.status(201).json({
        message: "Booking confirmed",
        booking,
        customerCalendarUrl: booking.customerCalendarUrl,
        email: emailResult,
      });
    }

    // 8. Flujo para reservas de pago: Crear sesión de Stripe Checkout
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: normalizedCustomerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: service.name,
              description: `${date} ${startTime}-${endTime}`,
            },
          },
        },
      ],
      metadata: {
        bookingId: String(booking._id),
      },
      success_url: `${clientUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}&slug=${business.slug}`,
      cancel_url: `${clientUrl}/booking/cancelled?booking_id=${booking._id}&slug=${business.slug}`,
    });

    booking.stripeSessionId = session.id;
    await booking.save();

    res.status(201).json({
      message: "Continue to payment",
      bookingId: booking._id,
      checkoutUrl: session.url,
    });
  } catch (error) {
    const errorMsg = error.type?.includes("Stripe") ? (error.raw?.message || error.message) : "Server error: " + error.message;
    res.status(error.statusCode || 500).json({ message: errorMsg, error: error.message });
  }
};

/**
 * Función auxiliar interna que confirma una reserva pagada tras validar Stripe.
 * Realiza comprobación final de disponibilidad, crea eventos de calendario y acredita el pago en la billetera.
 * 
 * @param {Object} params - Datos de la reserva y entidades relacionadas
 * @returns {Promise<Object>} Reserva confirmada y actualizada
 */
const confirmPaidBooking = async ({ booking, business, service, session }) => {
  if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
    return booking;
  }

  // Verifica si otro usuario confirmó el mismo horario en el intervalo
  const conflictingBookings = await Booking.find({
    _id: { $ne: booking._id },
    userId: booking.userId,
    date: booking.date,
    status: "confirmed",
  });

  const hasConflict = conflictingBookings.some((candidate) => (
    timesOverlap(booking.startTime, booking.endTime, candidate.startTime, candidate.endTime)
  ));

  if (hasConflict) {
    booking.status = "payment_failed";
    booking.paymentStatus = "failed";
    await booking.save();
    throw new Error("This slot is no longer available. No booking was created.");
  }

  // Actualiza estado de reserva y pago
  booking.status = "confirmed";
  booking.paymentStatus = "paid";
  booking.payoutStatus = booking.providerPayoutAmount > 0 ? "available" : "not_required";

  // Sincroniza con Google Calendar
  try {
    const calendarResult = await createBookingCalendarEvent({ business, service, booking });
    booking.googleEventId = calendarResult.googleEventId || "";
    booking.customerCalendarUrl = calendarResult.customerCalendarUrl || booking.customerCalendarUrl;
  } catch (calendarError) {
    console.error("Google Calendar confirmation failed:", calendarError.message);
  }

  await booking.save();

  // Registra la transacción en la billetera del proveedor
  await createBookingPayoutTransaction({
    booking,
    description: `Booking payment from ${booking.customerName || "Customer"}`,
  });

  // Envía notificación por correo
  sendBookingNotification({ business, service, booking, type: "confirmed" })
    .catch(emailError => console.error("Booking confirmation email failed:", emailError.message));

  return booking;
};

/**
 * Consulta el estado actual de una reserva por session_id (Stripe) o booking_id.
 * Si la reserva estaba en 'pending_payment' y el pago de Stripe resultó exitoso, la confirma automáticamente.
 * 
 * @param {Object} req - Objeto de solicitud (query: session_id o booking_id)
 * @param {Object} res - Objeto de respuesta
 */
export const getBookingStatus = async (req, res) => {
  try {
    const { session_id: sessionId, booking_id: bookingId } = req.query;
    const query = sessionId ? { stripeSessionId: sessionId } : { _id: bookingId };

    if (!sessionId && !bookingId) {
      return res.status(400).json({ message: "Booking identifier is required" });
    }

    let booking = await Booking.findOne(query).populate("serviceId", "name duration price");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Si viene de Stripe Checkout y el estado sigue pendiente de pago, verificar con la API de Stripe
    if (sessionId && booking.status === "pending_payment") {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({ message: "Stripe payments are not configured yet" });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== "paid") {
        booking.status = "payment_failed";
        booking.paymentStatus = "failed";
        await booking.save();
        return res.status(402).json({ message: "Payment was not successful. No booking was created.", booking });
      }

      const [business, service] = await Promise.all([
        User.findById(booking.userId),
        Service.findById(booking.serviceId),
      ]);

      if (!business || !service) {
        return res.status(404).json({ message: "Booking business or service was not found" });
      }

      // Procesa la confirmación definitiva
      await confirmPaidBooking({ booking, business, service, session });
      booking = await Booking.findById(booking._id).populate("serviceId", "name duration price");
    }

    res.json({ booking });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Cancela una reserva que se encuentra en estado pendiente de pago si el usuario canceló la pasarela.
 * 
 * @param {Object} req - Objeto de solicitud (body: booking_id)
 * @param {Object} res - Objeto de respuesta
 */
export const cancelPublicBookingPayment = async (req, res) => {
  try {
    const { booking_id: bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ message: "Booking identifier is required" });
    }

    const booking = await Booking.findOne({ _id: bookingId, status: "pending_payment" });
    if (!booking) {
      return res.json({ message: "No pending booking to cancel" });
    }

    booking.status = "payment_failed";
    booking.paymentStatus = "failed";
    await booking.save();

    res.json({ message: "Payment was not completed. No booking was created." });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};