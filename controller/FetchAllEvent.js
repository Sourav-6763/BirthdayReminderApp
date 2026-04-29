import axios from "axios";
import express from "express";
import { successResponse } from "./ErrorSuccessResponse.js";
import db from "../helper/fireBase.js";

const app = express();
app.use(express.json());

export const AllEvent = async (req, res, next) => {
  const { data } = req.body;

  const today = new Date();
  const fullDate = today.toISOString().split("T")[0];
  const month = String(today.getMonth() + 1).padStart(2, "0");

  try {
    let result = null;

    // ✅ TODAY
    if (data === "Today") {
      const ref = await db.collection("Holidays").doc(fullDate).get();
      result = ref.exists ? ref.data() : null;
    }

    // ✅ MONTH
    else if (data === "Month") {
      const snapshot = await db.collection("Holidays").get();

      const allData = snapshot.docs.map((doc) => doc.data());

      result = allData.filter((item) => {
        return item.date.split("-")[1] === month;
      });
    }

    return res.json({
      success: true,
      date: fullDate,
      month,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};