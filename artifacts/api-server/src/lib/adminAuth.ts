import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!adminEmail) {
    req.log.error("ADMIN_EMAIL is not configured");
    res.status(503).json({ error: "Admin access is not configured" });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAdmin = user.emailAddresses.some(
      (emailAddress) =>
        emailAddress.emailAddress.trim().toLowerCase() === adminEmail,
    );

    if (!isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error }, "Failed to verify admin access");
    res.status(503).json({ error: "Unable to verify admin access" });
  }
};