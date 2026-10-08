import { Router } from "express";

const router = Router();

router.get("/jarvis/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Auron Business OS",
    jarvis: true,
    message: "JARVIS connection successful",
  });
});

export default router;
