


export const PLATFORM_FEE_RATE = 0.1;

export const calculatePlatformSplit = (amount) => {
  const safeAmount = Number.isInfinite(amount) ? Math.max(0, Math.round(amount)) : 0; // validacion de que el monto sea correcto
  const platformFeeAmount = Math.round(Number(safeAmount) * PLATFORM_FEE_RATE);       // calcula el fee de la plataforma
  const providerPayoutAmount = Math.max(0, safeAmount - platformFeeAmount)            // calcula el monto que recibe el proveedor

  return {
    platformFeeAmount,
    providerPayoutAmount
  }
}

export const formatMinorMoney = (amount, currency = "inr") => {
  return new Intl.NumberFormat("en-US", {                 // Formateador de dinero (usa milenrama para separar miles)
    style: "currency",                                    // tipo de formato
    currency: currency.toUpperCase()                        // moneda en mayúsculas
  }).format((amount || 0) / 100);                           // divide entre 100 para convertir de centavos a moneda normal
}