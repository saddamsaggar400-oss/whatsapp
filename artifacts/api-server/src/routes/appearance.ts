import { db, appearanceSettingsTable } from "@workspace/db";
import { requireAdmin } from "../lib/adminAuth";
import {
  createAppearanceRouter,
  type AppearanceRepository,
} from "./appearanceRouter";

const databaseRepository: AppearanceRepository = {
  async load() {
    const [settings] = await db.select().from(appearanceSettingsTable).limit(1);
    return settings ? {
      primaryColor: settings.primaryColor,
      profileImageSize: settings.profileImageSize,
      highlightSize: settings.highlightSize,
      contentWidth: settings.contentWidth,
      buttonRadius: settings.buttonRadius,
    } : null;
  },
  async save(parsed) {
    const [settings] = await db
      .insert(appearanceSettingsTable)
      .values({ id: "default", ...parsed, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appearanceSettingsTable.id,
        set: { ...parsed, updatedAt: new Date() },
      })
      .returning();
    return {
      primaryColor: settings.primaryColor,
      profileImageSize: settings.profileImageSize,
      highlightSize: settings.highlightSize,
      contentWidth: settings.contentWidth,
      buttonRadius: settings.buttonRadius,
    };
  },
};

export default createAppearanceRouter({
  adminMiddleware: requireAdmin,
  repository: databaseRepository,
});