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
