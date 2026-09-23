import express from "express"
import {
    getPaymentOverview,
    requestWithdrawal,
    updatePayoutDetails
} from "../controllers/payment.js"
import auth from "../middleware/auth.js"


const router = express.Router()