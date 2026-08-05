import { Router } from "express";
import healthRouter from "./health.routes.js";
import invoiceRouter from "./invoice.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/invoices", invoiceRouter);

export default router;
