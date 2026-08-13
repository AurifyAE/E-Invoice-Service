import { Router } from "express";
import { getInvoice, getInvoiceTimeline, submitInvoice } from "../controllers/invoice.controller.js";

const invoiceRouter = Router();

invoiceRouter.post("/submit", submitInvoice);
invoiceRouter.get("/:entryId", getInvoice);
invoiceRouter.get("/status-timeline/:entryId", getInvoiceTimeline);

export default invoiceRouter;
