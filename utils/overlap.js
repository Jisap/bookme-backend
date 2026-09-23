import { timeToMinutes } from "./time.js";

// timeOverlap: Chekea si hay un solapamiento en los horarios.
// 
// Devuelve true si los rangos de tiempo se solapan, false en caso contrario.
export const timeOverlap = (firstStart, firstEnd, secondStart, secondEnd) => {
  // Se mide el tiempo en minutos para comparar los horarios
  // Se comprueba si el inicio del primer rango es menor que el final del segundo
  // y si el final del primer rango es mayor que el inicio del segundo
  return timeToMinutes(firstStart) < timeToMinutes(secondEnd) && timeToMinutes(firstEnd) > timeToMinutes(secondStart)
}

// Alias kept for backwards compatibility (bookingController imports timesOverlap).
export const timesOverlap = timeOverlap;