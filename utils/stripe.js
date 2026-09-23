import Stripe from "stripe";

export const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY); // Inicializa stripe
};

export const toStripeAmount = (price) => {
  return Math.round(Number(price || 0) * 100);      // Convierte a centavos para que stripe lo entienda
}