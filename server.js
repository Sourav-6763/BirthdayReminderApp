// import express from 'express';
// import nodemailer from 'nodemailer';
// import dotenv from 'dotenv';

// dotenv.config();
// const app = express();
// app.use(express.json());

// // Email sending endpoint
// app.post('/send-email', async (req, res) => {
//   const { to, subject, text } = req.body;

//   try {
//     // Create transporter
//     const transporter = nodemailer.createTransport({
//       service: 'gmail', // Or SMTP details
//       auth: {
//         user: process.env.SMTP_USERNAME,
//         pass: process.env.SMTP_PASSWORD
//       }
//     });

//     // Send email
//     await transporter.sendMail({
//       from: process.env.SMTP_USERNAME,
//       to,
//       subject,
//       text
//     });

//     res.json({ success: true, message: 'Email sent successfully!' });
//   } catch (error) {
//     console.error('Email error:', error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


const express = require('express');
const admin = require('firebase-admin');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

// ===== Firebase Admin init from ENV =====
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT env variable missing!');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

// ===== Config =====
const TEST_MODE = process.env.TEST_MODE === 'true';
const CRON_SCHEDULE = TEST_MODE ? '* * * * *' : '0 9 * * *'; // Every min in test, 9 AM in prod

// ===== Add birthday =====
app.post('/add-birthday', async (req, res) => {
  try {
    const { name, date, fcmToken } = req.body;
    if (!name || !date || !fcmToken) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const triggerDate = new Date(date);

    await db.collection('birthdays').add({
      name,
      date: triggerDate.toISOString(),
      fcmToken,
      lastNotified: null
    });

    console.log(`📅 Birthday for ${name} saved with date: ${triggerDate}`);
    res.json({ message: 'Birthday saved!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save birthday' });
  }
});

// ===== Helper =====
function daysUntilBirthday(birthdayDate, now) {
  const thisYear = now.getFullYear();
  const today = new Date(thisYear, now.getMonth(), now.getDate());
  let nextBirthday = new Date(thisYear, birthdayDate.getMonth(), birthdayDate.getDate());

  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffTime = nextBirthday - today;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// ===== Main check =====
async function checkBirthdays() {
  const now = new Date();
  console.log(`⏳ Checking birthdays at ${now}`);

  const snapshot = await db.collection('birthdays').get();
  snapshot.forEach(async doc => {
    const data = doc.data();
    const { name, date, fcmToken, lastNotified } = data;
    const birthdayDate = new Date(date);

    const daysLeft = daysUntilBirthday(birthdayDate, now);

    let message = null;
    if (daysLeft === 2) message = `⏳ Only 2 days left for ${name}'s birthday!`;
    else if (daysLeft === 1) message = `🎈 Only 1 day left for ${name}'s birthday!`;
    else if (daysLeft === 0) message = `🎂 Today is ${name}'s birthday! 🎉`;

    if (message) {
      const todayStr = now.toISOString().split('T')[0];
      if (lastNotified !== todayStr) {
        await sendNotification(fcmToken, message);
        await doc.ref.update({ lastNotified: todayStr });
      }
    }
  });
}

// ===== Send notification =====
async function sendNotification(fcmToken, body) {
  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title: '🎉 Birthday Reminder',
        body
      }
    });
    console.log(`✅ Notification sent: ${body}`);
  } catch (err) {
    console.error('❌ Error sending notification', err);
  }
}

// ===== Schedule job =====
cron.schedule(CRON_SCHEDULE, checkBirthdays);

// ===== Start server =====
app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});
