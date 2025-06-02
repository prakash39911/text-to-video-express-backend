import { Router } from "express";
import { handleMergeVideoAndAudio } from "../controller/mergeController";

const router = Router();

router.route("/").post(handleMergeVideoAndAudio);

export default router;
