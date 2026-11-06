import { Router, type IRouter, type RequestHandler } from "express";

export const defaultAppearance = {
  primaryColor: "#4051F5",
  profileImageSize: 150,
  highlightSize: 58,
  contentWidth: 935,
  buttonRadius: 8,
};

export type AppearanceInput = typeof defaultAppearance;

export type AppearanceRepository = {
  load: () => Promise<AppearanceInput | null>;
  save: (settings: AppearanceInput) => Promise<AppearanceInput>;
};

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parseAppearance(value: unknown): AppearanceInput | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  if (
    typeof input.primaryColor !== "string" ||
    !/^#[0-9a-fA-F]{6}$/.test(input.primaryColor) ||
    !isIntegerBetween(input.profileImageSize, 80, 220) ||
    !isIntegerBetween(input.highlightSize, 36, 110) ||
    !isIntegerBetween(input.contentWidth, 680, 1200) ||
    !isIntegerBetween(input.buttonRadius, 0, 28)
  ) {
    return null;
  }
  return {
    primaryColor: input.primaryColor,
    profileImageSize: input.profileImageSize,
    highlightSize: input.highlightSize,
    contentWidth: input.contentWidth,
    buttonRadius: input.buttonRadius,
  };
}

export function createAppearanceRouter({
  adminMiddleware,
  repository,
}: {
  adminMiddleware: RequestHandler;
  repository: AppearanceRepository;
}): IRouter {
  const router: IRouter = Router();

  router.get("/appearance", async (req, res): Promise<void> => {
    try {
      res.json(await repository.load() ?? defaultAppearance);
    } catch (error) {
      req.log.error({ err: error }, "Failed to load appearance settings");
      res.status(500).json({ error: "Unable to load appearance settings" });
    }
  });

  router.put("/admin/appearance", adminMiddleware, async (req, res): Promise<void> => {
    const parsed = parseAppearance(req.body);
    if (!parsed) {
      res.status(400).json({ error: "Invalid appearance settings" });
      return;
    }

    try {
      res.json(await repository.save(parsed));
    } catch (error) {
      req.log.error({ err: error }, "Failed to save appearance settings");
      res.status(500).json({ error: "Unable to save appearance settings" });
    }
  });

  return router;
}