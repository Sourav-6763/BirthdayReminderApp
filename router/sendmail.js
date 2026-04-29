import express from "express";
import { sendBirthdayWish } from "../controller/Birthdaywish.js";

const wishrouter = express.Router();

wishrouter.post("/sendmail", sendBirthdayWish);

export default wishrouter;