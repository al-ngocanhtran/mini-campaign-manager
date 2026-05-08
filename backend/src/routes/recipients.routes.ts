import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createRecipientSchema } from "../validation/schemas.js";
import * as ctrl from "../controllers/recipients.controller.js";

const router = Router();
router.use(authenticate);
router.get ("/", ctrl.list);
router.post("/", validate(createRecipientSchema), ctrl.create);

export default router;
