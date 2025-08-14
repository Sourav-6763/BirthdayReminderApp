const express = require("express");
const { sendBirthdayWish } = require("../controller/Birthdaywish");

const wishrouter = express.Router();


wishrouter.post("/sendmail", sendBirthdayWish);
module.exports = wishrouter;

