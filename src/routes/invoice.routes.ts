import { Router } from "express";
import { getInvoice, submitInvoice } from "../controllers/invoice.controller.js";

const invoiceRouter = Router();

invoiceRouter.post("/submit", submitInvoice);
invoiceRouter.get("/:entryId", getInvoice);

export default invoiceRouter;
