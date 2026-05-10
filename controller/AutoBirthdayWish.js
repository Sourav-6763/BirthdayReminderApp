import emailWithNodeMailer from '../helper/nodeMailer.js';
import {successResponse, errorResponse} from './ErrorSuccessResponse.js';

export const autoSendBirthdayWish = async ({ email, name }) => {
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  if (!email || !name) {
    return { success: false, message: "Email and name are required" };
  }

  if (!isValidEmail(email)) {
    return { success: false, message: "Invalid email please check email" };
  }

  try {
    const emailData = {
      email,
      subject: `🎉 Happy Birthday, ${name}! 🎂`,
      html: `<h1>Happy Birthday ${name}</h1>`,
    };

    await emailWithNodeMailer(emailData);

    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
