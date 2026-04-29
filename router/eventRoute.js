import express from "express";
import { AllEvent } from "../controller/FetchAllEvent.js";

const eventRoute = express.Router();

eventRoute.post("/fetchEvent", AllEvent);

export default eventRoute;