import {
  Router,
  type IRouter,
  type RequestHandler,
} from "express";
import { requireAdmin } from "../lib/adminAuth";

export const PRESENCE_TTL_MS = 45_000;

function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export function createPresenceRouter({
  adminMiddleware = requireAdmin,
  now = Date.now,
}: {
  adminMiddleware?: RequestHandler;
  now?: () => number;
} = {}): IRouter {
  const router: IRouter = Router();
  const activeVisitors = new Map<string, number>();

  function removeExpiredVisitors(currentTime = now()) {
    for (const [visitorId, lastSeenAt] of activeVisitors) {
      if (currentTime - lastSeenAt > PRESENCE_TTL_MS) {
        activeVisitors.delete(visitorId);
      }
    }
  }

  router.post("/presence", (req, res) => {
    const visitorId = req.body?.visitorId;
    if (!isValidVisitorId(visitorId)) {
      res.status(400).json({ error: "Invalid visitor id" });
      return;
    }

    activeVisitors.set(visitorId, now());
    res.status(204).end();
  });

  router.get("/admin/presence", adminMiddleware, (_req, res) => {
    removeExpiredVisitors();
    res.json({
      visitorIds: [...activeVisitors.keys()],
    });
  });

  return router;
}

const router = createPresenceRouter();

export default router;