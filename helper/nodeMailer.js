const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config()
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 2525,
  secure: false,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});


// Function to send email
const emailWithNodeMailer = async (emailData) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_USERNAME, // sender address
      to: emailData.email, // recipient address
      subject: emailData.subject, // Subject line
      html: emailData.html, // HTML body
    };

    // Send email
   await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
  
};

module.exports = emailWithNodeMailer;