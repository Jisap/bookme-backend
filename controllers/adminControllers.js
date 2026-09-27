import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Withdrawal from "../models/Withdrawal.js";

/**
 * Genera un token JWT para administradores autenticados con validez de 7 días.
 * 
 * @param {string} email - Correo del administrador
 * @returns {string} Token JWT firmado
 */
const createAdminToken = (email) => {
  return jwt.sign({ email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Estados finales o terminales en los que una solicitud de retiro ya no está activa/pendiente
const terminalWithdrawalStatuses = ["paid", "rejected"];

/**
 * Convierte un array de resultados de agregación de MongoDB [{ _id, total }]
 * en un objeto clave-valor { [tipo/estado]: total }.
 * 
 * @param {Array} rows - Filas resultantes del aggregate de MongoDB
 * @returns {Object} Diccionario mapeado { clave: total }
 */
const sumByKey = (rows = []) => rows.reduce((acc, row) => ({ ...acc, [row._id]: row.total }), {});

/**
 * Obtiene un resumen métrico global para el panel de administración.
 * Realiza agregaciones paralelas de usuarios, reservas, transacciones de billetera y retiros.
 * 
 * @returns {Promise<Object>} Resumen con métricas de usuarios, ingresos, comisiones, pagos y saldos retenidos
 */
const getAdminSummary = async () => {
  // Ejecuta consultas y agregaciones en paralelo para optimizar el rendimiento
  const [usersCount, bookingTotals, walletTotals, withdrawalTotals] = await Promise.all([
    // 1. Total de usuarios registrados
    User.countDocuments(),

    // 2. Agregación de reservas: totales, ingresos brutos, comisiones y pagos a proveedores
    Booking.aggregate([
      {
        $group: {
          _id: null,
          count: { $sum: 1 }, // Total de reservas registradas
          paidBookings: {     // Cantidad de reservas efectivamente pagadas
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] },
          },
          grossRevenue: {     // Ingresos brutos totales (monto total de reservas pagadas)
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$amount', 0] },
          },
          platformFees: {     // Comisiones de la plataforma recolectadas
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$platformFeeAmount', 0] },
          },
          paidProviderPayouts: { // Pagos destinados a proveedores por reservas pagadas
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$providerPayoutAmount', 0] },
          },
          confirmedProviderPayouts: { // Pagos a proveedores por reservas en estado confirmado
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, '$providerPayoutAmount', 0] },
          },
          activeProviderPayouts: { // Pagos a proveedores de reservas activas (no canceladas ni fallidas)
            $sum: {
              $cond: [
                { $in: ['$status', ['cancelled', 'payment_failed']] },
                0,
                '$providerPayoutAmount',
              ],
            },
          },
        },
      },
    ]),

    // 3. Agregación de transacciones de billetera agrupadas por tipo (booking_payout, withdrawal_hold, etc.)
    WalletTransaction.aggregate([
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
        },
      },
    ]),

    // 4. Agregación de solicitudes de retiro agrupadas por estado (pending, processing, paid, rejected)
    Withdrawal.aggregate([
      {
        $group: {
          _id: '$status',
          total: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  // Extrae y desglosa los resultados de las agregaciones
  const bookingSummary = bookingTotals[0] || {};
  const walletMap = sumByKey(walletTotals);
  const withdrawalMap = sumByKey(withdrawalTotals);

  // Desglose de pagos y ganancias
  const paidProviderPayouts = bookingSummary.paidProviderPayouts || 0;
  const confirmedProviderPayouts = bookingSummary.confirmedProviderPayouts || 0;
  const activeProviderPayouts = bookingSummary.activeProviderPayouts || 0;
  const walletEarned = walletMap.booking_payout || 0;
  const heldWithdrawals = walletMap.withdrawal_hold || 0;
  const reversedWithdrawals = walletMap.withdrawal_reversal || 0;

  // Calcula el valor máximo estimado para los pagos de proveedores
  const providerPayouts = Math.max(
    paidProviderPayouts,
    confirmedProviderPayouts,
    activeProviderPayouts,
    walletEarned,
  );

  // Cálculos de retiros
  const pendingWithdrawals = (withdrawalMap.pending || 0) + (withdrawalMap.processing || 0); // Retiros pendientes o en proceso
  const paidWithdrawals = withdrawalMap.paid || 0;                                           // Retiros completados/pagados

  // Saldo disponible de los usuarios en sus billeteras
  const usersAvailableBalance = Math.max(0, walletEarned - heldWithdrawals + reversedWithdrawals);

  // Estimaciones de fondos retenidos o pendientes de retiro
  const walletWithdrawalHold = usersAvailableBalance + pendingWithdrawals;
  const bookingWithdrawalHold = Math.max(0, providerPayouts - paidWithdrawals);

  // Retorna el resumen consolidado
  return {
    users: usersCount,                                                      // Total de usuarios
    bookings: bookingSummary.count || 0,                                    // Total de reservas
    paidBookings: bookingSummary.paidBookings || 0,                         // Reservas pagadas
    grossRevenue: bookingSummary.grossRevenue || 0,                         // Ingresos brutos
    platformFees: bookingSummary.platformFees || 0,                         // Comisiones de plataforma
    providerPayouts,                                                        // Pagos acumulados para proveedores
    walletEarned,                                                           // Total generado en billeteras
    usersAvailableBalance,                                                  // Saldo disponible actual de usuarios
    pendingWithdrawals,                                                     // Total de retiros pendientes
    paidWithdrawals,                                                        // Total de retiros liquidados
    withdrawalHolds: Math.max(walletWithdrawalHold, bookingWithdrawalHold), // Fondos retenidos o comprometidos
  };
};

/**
 * Valida la contraseña del administrador contra el hash encriptado o la variable de entorno.
 * 
 * @param {string} password - Contraseña en texto plano ingresada
 * @returns {Promise<boolean>} true si la contraseña es correcta, false de lo contrario
 */
const isAdminPasswordValid = async (password) => {
  if (process.env.ADMIN_PASSWORD_HASH) {
    return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  }

  return password === process.env.ADMIN_PASSWORD;
};

/**
 * Inicia sesión para el administrador de la plataforma.
 * Valida credenciales configuradas en las variables de entorno (.env) y genera un token JWT.
 * 
 * @param {Object} req - Objeto de solicitud (body: email, password)
 * @param {Object} res - Objeto de respuesta
 */
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

    // Comprueba que las credenciales del admin estén configuradas en las variables de entorno
    if (!adminEmail || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) {
      return res.status(503).json({ message: "Admin login is not configured" });
    }

    // Comprueba que el correo coincida con el del admin
    if (!email || !password || email.toLowerCase().trim() !== adminEmail) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    // Valida la contraseña mediante hash bcrypt o comparación directa
    const passwordValid = await isAdminPasswordValid(password);
    if (!passwordValid) {
      return res.status(401).json({ message: "Invalid admin credentials" });
    }

    res.json({
      message: "Admin logged in successfully",
      token: createAdminToken(adminEmail),
      admin: { email: adminEmail },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Obtiene todos los datos necesarios para renderizar el panel de administración general.
 * Consulta en paralelo: usuarios recientes, métricas globales, solicitudes de retiro y reservas pagadas.
 * 
 * @param {Object} req - Objeto de solicitud de Express
 * @param {Object} res - Objeto de respuesta de Express
 */
export const getAdminDashboard = async (req, res) => {
  try {
    const [
      users,
      summary,
      withdrawals,
      recentBookings,
    ] = await Promise.all([
      // Lista de usuarios registrados (últimos 100)
      User.find().select('name email businessName slug payoutDetails createdAt').sort({ createdAt: -1 }).limit(100),
      // Resumen estadístico global
      getAdminSummary(),
      // Solicitudes de retiro recientes con datos del usuario asociado (últimos 50)
      Withdrawal.find().populate('userId', 'name email businessName').sort({ createdAt: -1 }).limit(50),
      // Últimas 10 reservas pagadas
      Booking.find({ paymentStatus: 'paid' })
        .populate('userId', 'name email businessName')
        .populate('serviceId', 'name')
        .sort({ updatedAt: -1 })
        .limit(10),
    ]);

    res.json({
      summary,
      users,
      withdrawals,
      recentBookings,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Actualiza el estado de una solicitud de retiro (ej. 'processing', 'paid', 'rejected').
 * Si la solicitud es rechazada ('rejected'), restituye automáticamente los fondos retenidos
 * a la billetera del usuario mediante una transacción de tipo 'withdrawal_reversal'.
 * 
 * @param {Object} req - Objeto de solicitud (params: id, body: status, adminNote)
 * @param {Object} res - Objeto de respuesta
 */
export const updateWithdrawalStatus = async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const allowedStatuses = ['pending', 'processing', 'paid', 'rejected'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid withdrawal status' });
    }

    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    // No se permite modificar retiros que ya alcanzaron un estado final/terminal ('paid' o 'rejected')
    if (terminalWithdrawalStatuses.includes(withdrawal.status)) {
      return res.status(400).json({
        message: `Withdrawal is already ${withdrawal.status} and cannot be changed`,
      });
    }

    // Si el retiro es rechazado, revierte la retención y devuelve los fondos a la billetera del usuario
    if (status === 'rejected' && withdrawal.status !== 'rejected') {
      const existingReversal = await WalletTransaction.findOne({
        withdrawalId: withdrawal._id,
        type: 'withdrawal_reversal',
      });

      if (!existingReversal) {
        await WalletTransaction.create({
          userId: withdrawal.userId,
          withdrawalId: withdrawal._id,
          type: 'withdrawal_reversal',
          amount: withdrawal.amount,
          status: 'reversed',
          description: 'Withdrawal rejected and funds returned',
        });
      }
    }

    // Actualiza estado y notas del administrador
    withdrawal.status = status;
    withdrawal.adminNote = adminNote || withdrawal.adminNote;
    await withdrawal.save();

    // Recalcula el resumen global actualizado y popula los datos del usuario
    const [summary] = await Promise.all([
      getAdminSummary(),
      withdrawal.populate('userId', 'name email businessName'),
    ]);

    res.json({ message: `Withdrawal marked as ${status}`, withdrawal, summary });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
