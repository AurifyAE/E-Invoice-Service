import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

const healthRouter = Router();

healthRouter.get("/", healthController.getHealth);
healthRouter.get("/ready", healthController.getReadiness);

export default healthRouter;
