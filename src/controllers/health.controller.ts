import type { Request, Response } from "express";
import { healthService } from "../services/health/health.service.js";

class HealthController {
    getHealth(req: Request, res: Response): void {
        const result = healthService.getHealthStatus();

        res.status(200).json({
            success: true,
            data: result,
        });
    }

    getReadiness(req: Request, res: Response): void {
        const result = healthService.getReadinessStatus();
        const statusCode = result.status === "READY" ? 200 : 503;

        res.status(statusCode).json({
            success: result.status === "READY",
            data: result,
        });
    }
}

export const healthController = new HealthController();
