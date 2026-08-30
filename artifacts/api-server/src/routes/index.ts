import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sheetsRouter from "./sheets";
import driveRouter from "./drive";
import geminiRouter from "./gemini";
import licensingRouter from "./licensing";
import libraryRouter from "./library";
import { requireAuth } from "../middlewares/requireAuth";
import portableAuthRouter from "../lib/portable-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(portableAuthRouter);
router.get("/auth/access", requireAuth, (req, res) => {
  res.json({ authorized: true });
});
router.use(libraryRouter);
router.use(requireAuth, sheetsRouter);
router.use(requireAuth, driveRouter);
router.use(requireAuth, geminiRouter);
router.use(requireAuth, licensingRouter);

export default router;
