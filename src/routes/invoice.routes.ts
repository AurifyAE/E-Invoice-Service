import { Router } from "express";
import { submitInvoice } from "../controllers/invoice.controller.js";

const invoiceRouter = Router();

invoiceRouter.post("/submit", submitInvoice);

export default invoiceRouter;
