import express from "express";
import {
    getGoogleConnectUrl,
    handleGoogleCallback
} from "../controllers/integrationController.js";
import auth from "../middleware/auth.js";



const router = express.Router();

router.get("/google/connect", auth, getGoogleConnectUrl);
router.get("/google/callback", handleGoogleCallback);

export default router;