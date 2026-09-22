import express from "express"
import cors from "cors"
import "dotenv/config"
import http from "http"
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";


const PORT = process.env.PORT || 5000;
const app = express();

//Middlewares
app.use(cors());
app.use(express.json());

//DB
connectDB();

//Routes

app.get("/", (req, res) => {
    res.send("API WORKING")
});

app.use("/api/auth", authRoutes)
app.use("/api/services", serviceRoutes)
app.use("/api/availability", availabilityRoutes)
app.use("/api/integration", integrationRoutes)

const server = http.createServer(app);

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use.`);
        process.exit(1)
    }

    throw error;
});

server.listen(PORT, () => {
    console.log(`Server Started on http://localhost:${PORT}`)
});

