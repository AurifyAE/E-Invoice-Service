import { Router } from "express";
import { getDashboard, getInbound, getInvoice, getInvoiceTimeline, submitInvoice } from "../controllers/invoice.controller.js";

const invoiceRouter = Router();

invoiceRouter.post("/submit", submitInvoice);
invoiceRouter.get("/dashboard", getDashboard);
invoiceRouter.get("/inbound", getInbound);
invoiceRouter.get("/status-timeline/:entryId", getInvoiceTimeline);
invoiceRouter.get("/:entryId", getInvoice);

export default invoiceRouter;
