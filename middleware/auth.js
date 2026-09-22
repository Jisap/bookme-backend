import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;                       // Obtiene el header de autorización

  if (!authHeader || !authHeader.startsWith("Bearer ")) {             // Si no hay header o no empieza con "Bearer "
    return res.status(401).json({ message: "No token provided" });    // no hay token, devuelve error.
  }

  const token = authHeader.split(" ")[1];                             // Elimina "Bearer " del header

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);        // Decodifica el token
    req.user = { id: decoded.userId };                                // Añade el user al request
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });        // No es un token válido, devuelve error.
  }
}

export default auth;