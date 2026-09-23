import mongoose from "mongoose";
import WalletTransaction from "../models/WalletTransaction.js";
import Withdrawal from "../models/Withdrawal.js"; // Importa el modelo de retiros



export const createBookingPayouttransaction = async ({ booking, description }) => {
  if (!booking?.providerPayoutAmount) return null;

  try {
    return await WalletTransaction.create({ // Crea una transacción en la billetera para el pago del proveedor
      userId: booking.userId,
      bookingId: booking._id,
      type: "booking_payout",
      amount: booking.providerPayoutAmount,
      currency: booking.currency,
      status: "available",
      description: description || "Booking Payout after platform fee"
    });
  } catch (error) {
    if (error.code === 11000) {
      return WalletTransaction.findOne({ bookingId: booking._id, type: "booking_payout" })
    }

    throw error;
  }
};

export const getWalletSummary = async (userId) => {

  const [rows, withdrawalRows] = await Promise.all([ // Obtiene las transacciones de la billetera y los retiros
    WalletTransaction.aggregate([                       // Agrega las transacciones de la billetera
      { $match: { userId } },                              // Busca las transacciones del usuario
      {
        $group: {                                          // Agrupa las transacciones por tipo
          _id: "$type",
          total: { $sum: "$amount" },                      // Suma el monto de las transacciones
        },
      },
    ]),
    Withdrawal.aggregate([                              // Agrega los retiros
      { $match: { userId } },                              // Busca los retiros del usuario
      {
        $group: {                                          // Agrupa los retiros por estado
          _id: "$status",
          total: { $sum: "$amount" },                      // Suma el monto de los retiros
        },
      },
    ]),
  ]);

  const totals = rows.reduce((acc, row) => ({ ...acc, [row._id]: row.total }), {}); // Acumulador de transacciones de la billetera
  const withdrawalTotals = withdrawalRows.reduce((acc, row) => ({ ...acc, [row._id]: row.total }), {}); // Acumulador de retiros
  const earned = totals.booking_payout || 0; // Ganado
  const held = totals.withdrawal_hold || 0; // Retenido
  const processing = totals.withdrawal_processing || 0; // Procesando
  const reversed = totals.withdrawal_reversal || 0; // Revertido
  const pendingWithdrawals = (withdrawalTotals.pending || 0) + (withdrawalTotals.processing || 0); // Retiros pendientes
  const paidWithdrawals = withdrawalTotals.paid || 0;
  const availableBalance = Math.max(0, earned - held + reversed);


  return {
    earned,
    withdrawOrPending: held - reversed,
    pendingWithdrawals,
    paidWithdrawals,
    availableBalance,
    available: availableBalance,
  };
};