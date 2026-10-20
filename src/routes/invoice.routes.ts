import { Router } from "express";
import { getDashboard, getInbound, getInvoice, getInvoiceTimeline, submitInvoice } from "../controllers/invoice.controller.js";
import { authenticateErpToken, EINVOICE_SCOPES, requireEInvoiceAccess } from "../middleware/erp-auth.js";

const invoiceRouter = Router();

invoiceRouter.use(authenticateErpToken);

invoiceRouter.post("/submit", requireEInvoiceAccess(EINVOICE_SCOPES.SUBMIT), submitInvoice);
invoiceRouter.get("/dashboard", requireEInvoiceAccess(EINVOICE_SCOPES.READ), getDashboard);
invoiceRouter.get("/inbound", requireEInvoiceAccess(EINVOICE_SCOPES.READ), getInbound);
invoiceRouter.get("/status-timeline/:entryId", requireEInvoiceAccess(EINVOICE_SCOPES.READ), getInvoiceTimeline);
invoiceRouter.get("/:entryId", requireEInvoiceAccess(EINVOICE_SCOPES.READ), getInvoice);

export default invoiceRouter;
