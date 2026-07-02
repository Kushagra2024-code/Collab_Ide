import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import projectsRouter from "./projects";
import filesRouter from "./files";
import activityRouter from "./activity";
import messagesRouter from "./messages";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(projectsRouter);
router.use(filesRouter);
router.use(activityRouter);
router.use(messagesRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);

export default router;
