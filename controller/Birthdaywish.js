import emailWithNodeMailer from "../helper/nodeMailer.js";
import { successResponse, errorResponse } from "./ErrorSuccessResponse.js";

export const sendBirthdayWish = async (req, res, next) => {
  const { email, name } = req.body;

  if (!email || !name) {
    return errorResponse(res, {
      statusCode: 400,
      message: "Email and name are required",
      payload: {},
    });
  }

  try {
    const emailData = {
      email,
      subject: `🎉 Happy Birthday, ${name || "Friend"}! 🎂`,
      html: `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: auto; padding: 20px; background: linear-gradient(135deg, #f9d423, #ff4e50); color: #fff; border-radius: 10px; text-align: center;">
      <h1 style="font-size: 36px; margin-bottom: 10px;">🎉 Happy Birthday ${
        name || ""
      }! 🎉</h1>
      <p style="font-size: 18px; margin-bottom: 20px;">
        Wishing you a day filled with love, laughter, and unforgettable moments.  
        May this year bring you endless happiness and success! 💖
      </p>
      <img src="https://www.bestworldevents.com/wp-content/uploads/2021/12/89.gif" alt="Birthday Cake" style="width: 100%; max-width: 350px; border-radius: 8px; margin: 20px auto;" />
      <p style="font-size: 16px; margin-top: 20px;">Enjoy every bite of cake and every smile you receive today. 🎂</p>
      <footer style="margin-top: 30px; font-size: 14px; color: #ffe;">
        <p>From all of us at <strong>Birthday Remainder App</strong> 💌</p>
      </footer>
    </div>
      `,
    };

    await emailWithNodeMailer(emailData);

    return successResponse(res, {
      statusCode: 200,
      message: "Birthday wish sent successfully 🎉",
      payload: {},
    });
  } catch (error) {
    next(error);
  }
};