import QRCode from "qrcode";

export const createZatcaQrDataUrl = async (payload: string): Promise<string> =>
    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", type: "image/png" });

export const createZatcaQrPng = async (payload: string): Promise<Buffer> =>
    QRCode.toBuffer(payload, { errorCorrectionLevel: "M", type: "png" });
