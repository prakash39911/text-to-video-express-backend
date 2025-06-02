import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import mergeRoute from "./routes/mergeRoute";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/v1/api/mergeVideoAudio", mergeRoute);

app.listen(process.env.PORT || 8000, () => {
  console.log("Server Started On Port:-", process.env.PORT);
});
