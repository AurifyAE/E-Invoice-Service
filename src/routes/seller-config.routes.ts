import { Router } from "express";
import {
    createSellerConfigHandler,
    getSellerConfigHandler,
    updateSellerConfigHandler,
} from "../controllers/seller-config.controller.js";
import { authenticateErpToken, EINVOICE_SCOPES, requireEInvoiceAccess } from "../middleware/erp-auth.js";

const sellerConfigRouter = Router();

sellerConfigRouter.use(authenticateErpToken);

sellerConfigRouter.post("/", requireEInvoiceAccess(EINVOICE_SCOPES.CONFIG), createSellerConfigHandler);
sellerConfigRouter.get("/:sellerVatTrn", requireEInvoiceAccess(EINVOICE_SCOPES.READ), getSellerConfigHandler);
sellerConfigRouter.patch("/:sellerVatTrn", requireEInvoiceAccess(EINVOICE_SCOPES.CONFIG), updateSellerConfigHandler);

export default sellerConfigRouter;
