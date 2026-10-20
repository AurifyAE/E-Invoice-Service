import type { NextFunction, Request, Response } from "express";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
        const durationMs = Date.now() - startTime;
        const logPayload = {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            organizationId: req.principal?.organizationId,
            userId: req.principal?.userId,
        };

        console.log(JSON.stringify(logPayload));
    });

    next();
};
