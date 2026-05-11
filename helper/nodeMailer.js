import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT), // convert to number
  secure: true, // false for 587
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});

const emailWithNodeMailer = async (emailData) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_USERNAME,
      to: emailData.email,
      subject: emailData.subject,
      html: emailData.html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};


// import axios from "axios";
// import dotenv from "dotenv";

// dotenv.config();

// const emailWithNodeMailer = async (emailData) => {
//   try {
//     const res = await axios.post(
//       "https://api.brevo.com/v3/smtp/email",
//       {
//         sender: { email: process.env.SENDER_EMAIL }, // verified email
//         to: [{ email: emailData.email }],
//         subject: emailData.subject,
//         htmlContent: emailData.html,
//       },
//       {
//         headers: {
//           "api-key": process.env.BREVO_API_KEY,
//           "Content-Type": "application/json",
//         },
//       }
//     );

//     // console.log("Email sent:", res.data);
//     return res.data;

//   } catch (error) {
//     console.error("Error sending email:", error.response?.data || error.message);
//     throw error;
//   }
// };

export default emailWithNodeMailer;
