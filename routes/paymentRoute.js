import express from "express"
import {
    getPaymentOverview,
    requestWithdrawal,
    updatePayoutDetails
} from "../controllers/paymentController.js"
import auth from "../middleware/auth.js"


const router = express.Router();

router.get("/", auth, getPaymentOverview);
router.put("/payout-details", auth, updatePayoutDetails);
router.post("/withdrawals", auth, requestWithdrawal);
// Alias legacy con typo para no romper clientes antiguos
router.post("/withdrawls", auth, requestWithdrawal);

export default router;