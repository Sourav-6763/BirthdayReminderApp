const express = require("express");
const { AllEvent } = require("../controller/FetchAllEvent");

const eventRoute = express.Router();


eventRoute.post("/fetchEvent", AllEvent);
module.exports = eventRoute;

