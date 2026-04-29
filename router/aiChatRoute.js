import express from "express";
import { quickAns } from "../controller/aiChat.js";

const AiChatRoute = express.Router();


AiChatRoute.post("/reply",quickAns);

export default AiChatRoute;


