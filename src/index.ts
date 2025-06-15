import dotenv from "dotenv";
import express, { Response } from "express";
import cors from "cors";
import mergeRoute from "./routes/mergeRoute";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/v1/api/mergeVideoAudio", mergeRoute);

app.get("/", (res: Response) => {
  Response.json({
    message: "Hello! Your text-to-video server is running",
  });
  return;
});

app.listen(process.env.PORT || 8000, () => {
  console.log("Server Started On Port:-", process.env.PORT);
});
