import express from "express";
import { listAvailability, saveAvailability } from "../controllers/availabilityController.js";
import auth from "../middleware/auth.js";


const router = express.Router();

router.get("/", auth, listAvailability);
router.get("/", auth, saveAvailability)


export default router;