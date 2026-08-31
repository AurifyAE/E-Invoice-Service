import { Router } from "express";
import { createZatcaSaleInvoiceHandler, getZatcaSaleInvoiceQrHandler } from "../controllers/zatca/zatcaSaleInvoice.controller.js";

const zatcaRouter = Router();

zatcaRouter.post("/sale-invoice", createZatcaSaleInvoiceHandler);
zatcaRouter.get("/sale-invoice/:documentId/qr", getZatcaSaleInvoiceQrHandler);

export default zatcaRouter;
