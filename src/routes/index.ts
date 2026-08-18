import { Router } from "express";
import healthRouter from "./health.routes.js";
import invoiceRouter from "./invoice.routes.js";
import sellerConfigRouter from "./seller-config.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/invoices", invoiceRouter);
router.use("/seller-config", sellerConfigRouter);

export default router;
