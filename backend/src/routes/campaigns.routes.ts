import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import * as ctrl from "../controllers/campaigns.controller.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  scheduleCampaignSchema,
} from "../validation/schemas.js";

const router = Router();
router.use(authenticate);

router.get   ("/",             ctrl.list);
router.post  ("/",             validate(createCampaignSchema),   ctrl.create);
router.get   ("/:id",          ctrl.get);
router.patch ("/:id",          validate(updateCampaignSchema),   ctrl.update);
router.delete("/:id",          ctrl.remove);
router.post  ("/:id/schedule", validate(scheduleCampaignSchema), ctrl.schedule);
router.post  ("/:id/send",     ctrl.send);
router.get   ("/:id/stats",    ctrl.stats);

export default router;
