const express = require("express");
const { quickAns } = require("../controller/aiChat");

const AiChatRoute = express.Router();


AiChatRoute.post("/reply",quickAns);
module.exports = AiChatRoute;


