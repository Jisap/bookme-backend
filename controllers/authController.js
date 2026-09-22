import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import { requestEmailOtp, verifyEmailOtp } from "../utils/emailOtp.js"
import slugify from "../utils/slug.js"

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  })
}

const toUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  slug: user.slug,
  businessName: user.businessName,
  businessDescription: user.businessDescription,
  brandTheme: user.brandTheme,
  brandAccent: user.brandAccent,
  timezone: user.timezone,
  googleCalendarConnected: user.googleCalendarConnected,
  googleCalendarId: user.googleCalendarId,
  payoutDetails: user.payoutDetails,
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
});

// Crear un nuevo usuario, verificar su email 
// y devolver un token de sesión.
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, businessName, businessDescription, timezone, emailOtp } = req.body; // Datos del formulario

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" })
    }

    const normalizedEmail = email.toLowerCase().trim();                                                // Normaliza el email  

    const existingUser = await User.findOne({ email: normalizedEmail });                               // Verifica que el email no este registrado
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const otpResult = await verifyEmailOtp({                                                           // Valida y consume el emailOtp  
      email: normalizedEmail,                                                                          // Email a verificar  
      purpose: "registration",                                                                         // Proposito: registro  
      code: emailOtp,                                                                                  // Codigo OTP  
      consume: true,                                                                                   // Consume el OTP después de verificarlo  
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Email verification is required" })
    }

    const baseSlug = slugify(businessName || name) || "bussiness";                                      // Crea un slug de base 
    let finalSlug = baseSlug;                                                                           // Crea un slug único para el usuario
    let counter = 1;                                                                                    // Se define un contador para generar slugs únicos

    while (await User.findOne({ slug: finalSlug })) {                                                   // Verifica que el slug no exista  
      finalSlug = `${baseSlug}-${counter}`;                                                             // Agrega un contador si el slug existe  
      counter += 1;                                                                                     // Incrementa el contador  
    }

    const hashPassword = await bcrypt.hash(password, 10);                                               // Hash password

    const user = await User.create({                                                                    // Crea el usuario en BD
      name,
      email: normalizedEmail,
      password: hashPassword,
      slug: finalSlug,
      businessName: businessName || "",
      timezone
    });

    const token = createToken(user._id);                                                               // Crea token

    res.status(201).json({                                                                             // Devuelve respuesta
      message: "Registration successful",                                                              // Mensaje de exito  
      token,                                                                                           // Token de usuario  
      user: toUserResponse(user),                                                                      // Usuario creado  
    });

  } catch (err) {
    console.log("Registration failed", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

// Envia un código OTP al email para iniciar el registro.
export const requestRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;                                                                      // Obtiene el email del cuerpo de la solicitud
    const normalizedEmail = email?.toLowerCase().trim();                                             // Normaliza el email

    if (!normalizedEmail) {                                                                          // Verifica que el email no este vacío
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });                             // Verifica que el email no este registrado
    if (existingUser) {                                                                              // Si el email esta registrado  
      return res.status(400).json({ message: "Email already in use" })                               // Devuelve error
    }

    const result = await requestEmailOtp({                                                           // Genera un código OTP para el email
      email: normalizedEmail,
      purpose: "registration"
    });

    res.json({                                                                                       // Devuelve respuesta
      message: "Verification code sent to your email", result
    })

  } catch (err) {
    console.log("Error requesting registration OTP", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

// Verifica el código OTP enviado al email para iniciar el registro.
export const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, emailOtp } = req.body;                                                           // Obtiene el email y el código OTP del cuerpo de la solicitud
    const normalizedEmail = email?.toLowerCase().trim();                                            // Normaliza el email

    if (!normalizedEmail) {                                                                         // Verifica que el email no este vacío
      return res.status(400).json({ message: "Email OTP are required" })
    }

    const existingUser = await User.findOne({ email: normalizedEmail });                            // Verifica que el email no este registrado
    if (existingUser) {                                                                             // Si el email esta registrado  
      return res.status(400).json({ message: "Email already in use" })                              // Devuelve error
    }

    const otpResult = await verifyEmailOtp({                                                        // Verifica y consume el emailOtp  
      email: normalizedEmail,
      purpose: "registration",
      code: emailOtp,
      consume: true,
    });

    if (!otpResult.verified) {
      return res.status(400).json({ message: otpResult.reason || "Invalid OTP" })
    }

    res.json({
      message: "OTP verified",
    })
  } catch (err) {
    console.log("Error verifying registration OTP", err);
    res.status(500).json({ message: "Server error", error: err.message })
  }
}

// Inicia sesión de usuario y devuelve el token y los datos del usuario
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;                                                            // Obtiene el email y la contraseña del cuerpo de la solicitud
    if (!email || !password) {                                                                       // Verifica que el email y la contraseña no estén vacíos
      return res.status(400).json({ message: "Email and password are required" })
    }

    const normalizedEmail = email.toLowerCase().trim();                                              // Normaliza el email
    const user = await User.findOne({ email: normalizedEmail });                                     // Verifica que el email no este registrado
    if (!user) {                                                                                     // Si el email no esta registrado  
      return res.status(401).json({ message: "Invalid credentials" });                               // Devuelve error
    }

    const isMatch = await bcrypt.compare(password, user.password);                                   // Compara la contraseña
    if (!isMatch) {                                                                                  // Si la contraseña no es correcta  
      return res.status(401).json({ message: "Invalid credentials" });                               // Devuelve error
    }

    const token = createToken(user._id);                                                             // Crea el token

    res.json({                                                                                       // Devuelve respuesta
      message: "Logged in sucessfully",
      token,
      user: toUserResponse(user)
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

// Obtiene el perfil del usuario logueado
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json({ user: toUserResponse(user) })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Actualiza los datos del usuario autenticado.
export const updateProfile = async (req, res) => {
  try {
    const { businessName, businessDescription, timezone, brandTheme, brandAccent } = req.body;   // Obtiene los datos del cuerpo de la solicitud

    const user = await User.findById(req.user.id);                                               // Obtiene el usuario por id
    if (!user) {                                                                                 // Verifica que el usuario exista
      return res.status(404).json({ message: 'User not found' });                                // Devuelve error
    }

    if (businessName !== undefined) user.businessName = businessName;                            // Actualiza solo los campos que vienen en el req.body.
    if (businessDescription !== undefined) user.businessDescription = businessDescription;
    if (timezone !== undefined) user.timezone = timezone;
    if (brandTheme !== undefined) user.brandTheme = brandTheme;
    if (brandAccent !== undefined) user.brandAccent = brandAccent;

    const baseSlug = slugify(user.businessName || user.name) || 'business';                        // Genera el slug
    let finalSlug = baseSlug;                                                                      // Asigna el slug base
    let counter = 1;                                                                               // Inicializa el contador

    while (await User.findOne({ slug: finalSlug, _id: { $ne: user._id } })) {                      // Verifica que el slug no exista
      finalSlug = `${baseSlug}-${counter}`;                                                        // Genera un nuevo slug con el contador
      counter += 1;                                                                                // Incrementa el contador
    }

    user.slug = finalSlug;                                                                         // Asigna el slug final

    await user.save();                                                                             // Guarda el usuario

    res.json({                                                                                     // Devuelve respuesta
      message: 'Profile updated successfully',
      user: toUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};