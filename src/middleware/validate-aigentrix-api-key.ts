import type { NextFunction, Request, Response } from "express";

export const validateAigentrixApiKey = (req: Request, res: Response, next: NextFunction) => {
    if (!req.get("X-API-KEY")?.trim()) {
        return res.status(401).json({
            success: false,
            error: {
                code: "INVALID_AUTHORIZATION",
                message: "Invalid authorization: X-API-KEY is required.",
            },
        });
    }

    return next();
};
