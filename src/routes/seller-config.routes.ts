import { Router } from "express";
import {
    createSellerConfigHandler,
    getSellerConfigHandler,
    updateSellerConfigHandler,
} from "../controllers/seller-config.controller.js";

const sellerConfigRouter = Router();

sellerConfigRouter.post("/", createSellerConfigHandler);
sellerConfigRouter.get("/:sellerVatTrn", getSellerConfigHandler);
sellerConfigRouter.patch("/:sellerVatTrn", updateSellerConfigHandler);

export default sellerConfigRouter;
