import express from "express";
import { getAdminDashboard, loginAdmin, updateWithdrawalStatus } from "../controllers/adminControllers";
import adminAuth from "../middleware/adminAuth";

const router = express.Router();

router.post("/login", loginAdmin);
router.get("/dashboard", adminAuth, getAdminDashboard);
router.patch("/withdrawals/:id", adminAuth, updateWithdrawalStatus);

export default router;