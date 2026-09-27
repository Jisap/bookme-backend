import Availability from "../models/Availability.js";
import { isValidTimeRange } from "../utils/time.js";

/**
 * Obtiene la configuración de disponibilidad semanal del usuario autenticado.
 * Devuelve los días y rangos horarios ordenados por día de la semana (0 = Domingo a 6 = Sábado).
 * 
 * @param {Object} req - Objeto de solicitud de Express (contiene req.user.id del usuario autenticado)
 * @param {Object} res - Objeto de respuesta de Express
 */
export const listAvailability = async (req, res) => {
  try {
    // Consulta la disponibilidad del usuario y la ordena cronológicamente por día de la semana
    const availability = await Availability.find({ userId: req.user.id }).sort({ dayOfWeek: 1 });

    res.json({ availability });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Guarda o actualiza la disponibilidad de un día específico para el usuario autenticado.
 * Filtra y valida que los rangos horarios (slots) sean válidos antes de persistirlos.
 * 
 * @param {Object} req - Objeto de solicitud (body: dayOfWeek [0-6], slots [{ startTime, endTime }])
 * @param {Object} res - Objeto de respuesta
 */
export const saveAvailability = async (req, res) => {
  try {
    const { dayOfWeek, slots } = req.body;

    // Valida que el día de la semana sea un número entre 0 (domingo) y 6 (sábado)
    if (dayOfWeek === undefined || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ message: "Valid day of week is required" });
    }

    // Filtra únicamente los slots que posean inicio y fin con un rango de tiempo válido (inicio < fin)
    const cleanedSlots = (slots || []).filter((slot) => (
      slot.startTime && slot.endTime && isValidTimeRange(slot.startTime, slot.endTime)
    ));

    // Actualiza el registro existente o crea uno nuevo si no existía (upsert)
    const availability = await Availability.findOneAndUpdate(
      { userId: req.user.id, dayOfWeek },
      { slots: cleanedSlots },
      { new: true, upsert: true }
    );

    res.json({ message: "Availability saved", availability });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};