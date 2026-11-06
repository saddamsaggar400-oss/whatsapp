import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import messagesRouter from "./messages";
import presenceRouter from "./presence";
import storageRouter from "./storage";
import appearanceRouter from "./appearance";
import storiesRouter from "./stories";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(messagesRouter);
router.use(presenceRouter);
router.use(storageRouter);
router.use(appearanceRouter);
router.use(storiesRouter);

export default router;
