import { Router } from "express";
import { getDashboard, getInvoice, getInvoiceTimeline, submitInvoice } from "../controllers/invoice.controller.js";
import { validateAigentrixApiKey } from "../middleware/validate-aigentrix-api-key.js";

const invoiceRouter = Router();

invoiceRouter.use(validateAigentrixApiKey);
invoiceRouter.post("/submit", submitInvoice);
invoiceRouter.get("/dashboard", getDashboard);
invoiceRouter.get("/status-timeline/:entryId", getInvoiceTimeline);
invoiceRouter.get("/:entryId", getInvoice);

export default invoiceRouter;
