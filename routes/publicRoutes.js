import express from "express";
import {
    cancelPublicBookingPayment,
    createPublicBooking,
    getBookingStatus,
    getPublicBusiness,
    getPublicSlots,
    requestPublicBookingOtp,
    verifyPublicBookingOtp,
} from "../controllers/publicController.js";

const router = express.Router();

router.get('/booking/status', getBookingStatus);
router.post('/booking/cancel-payment', cancelPublicBookingPayment);
router.get('/:slug', getPublicBusiness);
router.get('/:slug/slots', getPublicSlots);
router.post('/:slug/request-otp', requestPublicBookingOtp);
router.post('/:slug/verify-otp', verifyPublicBookingOtp);
router.post('/:slug/book', createPublicBooking);

export default router;