import express from 'express';
import admin from 'firebase-admin';
import cron from 'node-cron';
import dotenv from 'dotenv';
import wishrouter from './router/sendmail.js';
import {errorResponse} from './controller/ErrorSuccessResponse.js';
import createError from 'http-errors';
import eventRoute from './router/eventRoute.js';
import cors from 'cors';
import AiChatRoute from './router/aiChatRoute.js';
import {autoSendBirthdayWish} from './controller/AutoBirthdayWish.js';
import {decryptText, encryptText} from './helper/encrypedText.js';
import {sendfcmNotification} from './helper/sendfcmNotification.js';
import {birthdayQueue} from './helper/queue.js';
import {startBirthdayWorker} from './helper/worker.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');

// ===== Firebase Admin init from ENV =====
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
const messaging = admin.messaging();

// ===== Config =====
const TEST_MODE = process.env.TEST_MODE === 'true';
const CRON_SCHEDULE = TEST_MODE ? '* * * * *' : '0 9 * * *';
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

// ===== Routers =====
app.use('/sendBirthdayWish', wishrouter);
app.use('/allEvent', eventRoute);
app.use('/AiChat', AiChatRoute);

app.post('/backup', async (req, res) => {
  const {userid} = req.body;
  const {token} = req.body;
  // console.log(token);
  try {
    const snap = await db
      .collectionGroup('allBirthdays')
      .where('userId', '==', userid)
      .orderBy('month')
      .orderBy('day')
      .get();
    const batch = db.batch();

    snap.forEach(doc => {
      batch.update(doc.ref, {
        fcmToken: token,
      });
    });
    await batch.commit();
    // console.log('Docs found:', snap.size);
    const snapupdatedData = await db
      .collectionGroup('allBirthdays')
      .where('userId', '==', userid)
      .orderBy('month')
      .orderBy('day')
      .get();

    const data = [];
    // snapupdatedData.forEach(doc => {
    //   console.log(doc.data());
    // });

    snapupdatedData.forEach(doc => {
      const docData = doc.data();
      // console.log(docData);
      let phoneNumber = null;
      let email = null;
      if (docData.phoneNumber) {
        phoneNumber = decryptText(docData.phoneNumber);
      }
      if (docData.phoneNumber) {
        email = decryptText(docData.email);
      }
      // console.log(phoneNumber);
      data.push({
        id: doc.id,
        ...docData,
        phoneNumber,
        email,
      });
    });
    // console.log(data);
    return res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching data',
    });
  }
});

// ===== Delete birthday =====
app.delete('/delete-birthday', async (req, res) => {
  const fullDaymonth = `${req.body.day}-${req.body.month}`;
  // const day = Number(fullDate.split('-')[2]);
  // const month = Number(fullDate.split('-')[1]);
  const id = req.body.id;
  // const userDevId=req.body.userId;
  // console.log(req.body);
  try {
    const docRef = db
      .collection('birthdays2')
      .doc(fullDaymonth)
      .collection('allBirthdays')
      .doc(id);
    const snapshort = await docRef.get();
    if (!snapshort.exists) {
      return res.status(404).json({message: 'Document not found'});
    }
    // db.collection('users').doc(userDevId).
    // const res = await getDocs(q);
    await docRef.delete();
    return res.json({success: true, deleteId: id});
  } catch (err) {
    res.status(500).json({error: 'Failed to delete birthday'});
  }
});

// ===== Health check =====

function getHealthStatus() {
  return {
    status: 'ok',
    uptime: process.uptime(),
  };
}

app.get('/check-testing', (req, res) => {
  res.status(200).json(getHealthStatus());
});

// function getHealthStatus() {
//   return {
//     status: 'ok',
//     uptime: process.uptime(),
//   };
// }

app.get('/check-birthday', (req, res) => {
  res.status(200).json(getHealthStatus());
  setImmediate(() => {
    checkBirthdays()
      .then(() => console.log('🎉 Birthday check completed via health ping'))
      .catch(err =>
        console.error('❌ Birthday check failed via health ping', err),
      );
  });
});

app.get('/check-holidays', (req, res) => {
  res.status(200).json(getHealthStatus());
  setImmediate(() => {
    checkHolidays();
  });
});

app.post('/edit-birthday', async (req, res) => {
  // console.log(req.body.itemId);
  // try {
  const {
    name,
    year,
    month,
    oldDay,
    oldMonth,
    day,
    fcmToken,
    timezone,
    country,
    userId,
    email,
    category,
    phoneNumber,
    itemId,
  } = req.body;

  if (!name || !month || !day || !year) {
    return res.status(400).json({error: 'Missing fields'});
  }
  const snapshortRef = await db
    .collection('birthdays2')
    .doc(`${oldDay}-${oldMonth}`)
    .collection('allBirthdays')
    .doc(itemId);
  const data = await snapshortRef.get();
  if (!data.exists) {
    return res.status(404).json({message: 'Document not found'});
  }
  await snapshortRef.delete();

  // await snapshortRef.delete();
  const encryptedEmail = encryptText(email);
  const encryptedPhoneNumber = encryptText(phoneNumber);
  const ref = await db
    .collection('birthdays2')
    .doc(`${day}-${month}`)
    .collection('allBirthdays')
    .add({
      name,
      userId,
      email: encryptedEmail,
      phoneNumber: encryptedPhoneNumber,
      month: parseInt(month),
      day: parseInt(day),
      year: parseInt(year),
      fcmToken,
      category,
      timezone,
      country,
      lastNotified: {
        onedays: null,
        twoday: null,
        birthday: null,
      },
    });

  res.status(200).json({message: 'Birthday saved!', id: ref.id});
  // } catch (err) {
  //   res.status(500).json({error: 'Failed to save birthday'});
  // }
});

// app.post('/save-user', async (req, res) => {
//   try {
//     const {fcmToken, userId, country, timezone} = req.body;
//     console.log(req.body);
//     if (!fcmToken || !userId || !country || !timezone) {
//       return res.status(400).json({error: 'Missing required fields'});
//     }

//     await db
//       .collection('users')
//       .doc(userId)
//       .set({fcmToken, country, timezone}, {merge: true});

//     // ✅ IMPORTANT: send response
//     return res.json({message: 'User saved successfully'});
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       error: 'Server error',
//     });
//   }
// });

// ===== Add birthday =====
app.post('/add-birthday', async (req, res) => {
  try {
    const {
      name,
      year,
      month,
      day,
      fcmToken,
      timezone,
      country,
      userId,
      email,
      phoneNumber,
      category,
    } = req.body;
    const encryptedEmail = encryptText(email);
    const encryptedPhoneNumber = encryptText(phoneNumber);

    if (!name || !month || !day || !fcmToken) {
      return res.status(400).json({error: 'Missing fields'});
    }

    const ref = await db
      .collection('birthdays2')
      .doc(`${day}-${month}`)
      .collection('allBirthdays')
      .add({
        name,
        category,
        userId,
        email: encryptedEmail,
        phoneNumber: encryptedPhoneNumber,
        month: parseInt(month),
        day: parseInt(day),
        year: parseInt(year),
        fcmToken,
        timezone,
        country,
        lastNotified: {
          onedays: null,
          twoday: null,
          birthday: null,
        },
      });
    // const ref2 = await db.collection('users').doc(userId).get();
    // await db
    //   .collection('users')
    //   .doc(userId)
    //   .set(
    //     {
    //       birthdays: admin.firestore.FieldValue.arrayUnion(ref),
    //     },
    //     {merge: true},
    //   );
    // if (!ref2.exists) {
    //   console.log('❌ User doc not found');
    // } else {
    //   console.log('✅ User data:', ref2.data());
    // }

    res.json({message: 'Birthday saved!', id: ref.id});
  } catch (err) {
    res.status(500).json({error: 'Failed to save birthday'});
  }
});

function check1day2day0day(value) {
  // সার্ভার যে দেশেই থাকুক, টাইম সবসময় Asia/Kolkata (IST) তে লক থাকবে
  const timezone = 'Asia/Kolkata';
  const now = new Date(
    new Date().toLocaleString('en-US', {timeZone: timezone}),
  );

  // দিন যোগ বা বিয়োগ করা
  now.setDate(now.getDate() + value);

  return {
    day: now.getDate(),
    month: now.getMonth() + 1, // JavaScript মাসের জন্য +1 ঠিক আছে
  };
}

// function check1day2day0day(value) {
//   const now = new Date();
//   now.setDate(now.getDate() + value);
//   return {
//     day: now.getDate(),
//     month: now.getMonth() + 1,
//   };
// }

// checkBirthdays();
// ===== Check birthdays with separate lastNotified for each type =====
async function checkBirthdays() {
  const today = check1day2day0day(0);
  const oneDay = check1day2day0day(1);
  const twoDays = check1day2day0day(2);
  // console.log(today);
  const [todaySnap, oneDaySnap, twoDaySnap] = await Promise.all([
    db
      .collection('birthdays2')
      .doc(`${today.day}-${today.month}`)
      .collection('allBirthdays')
      .get(),
    db
      .collection('birthdays2')
      .doc(`${oneDay.day}-${oneDay.month}`)
      .collection('allBirthdays')
      .get(),
    db
      .collection('birthdays2')
      .doc(`${twoDays.day}-${twoDays.month}`)
      .collection('allBirthdays')
      .get(),
  ]);

  for (const doc of todaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();

   
    const prevSaveYear = Number(
      doc.data().lastNotified?.birthday?.split('-')[0],
    );
    if (
      doc.data().lastNotified?.birthday != null &&
      prevSaveYear >= Currentyear
    ) {
      continue;
    }
    const dataForBirthdayWish = doc.data();
    const decEmail = decryptText(dataForBirthdayWish.email);
    // const todayStr = new Date().toISOString().split('T')[0];---------age chilo
    // এটি সার্ভারের UTC ডেটকে বাদ দিয়ে নিখুঁত ইন্ডিয়ান/বাংলাদেশী YYYY-MM-DD ফরম্যাট দেবে
    const tzDate = new Date(
      new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
    );
    const todayStr = tzDate.toLocaleDateString('en-CA');
    //  const decName=decryptText(dataForBirthdayWish.name);
    //  console.log("Encrypted Email:", dataForBirthdayWish.email)
    // console.log("Decrypted Email:", decEmail)

    // console.log("Encrypted Name:", dataForBirthdayWish.name)
    // console.log("Decrypted Name:", decName)
    if (decEmail || dataForBirthdayWish.name) {
      await birthdayQueue.add(
        'birthday-job', 
        {
          token: doc.data().fcmToken,
          email: decEmail,
          name: dataForBirthdayWish.name,
          // message: `🎂 Today is ${dataForBirthdayWish.name}'s birthday! 🎉`,
          heading: 'Birthday Reminder',
          // docPath: doc.ref.path,
          type: 'email', // 👈 টাইপ সেট করে দিন 'email'
          todayStr,
        },
        {
          removeOnComplete: {age: 3600},
          removeOnFail: {age: 86400},
        },
      );
    }
    //ata original----------------------
    //       const result = await autoSendBirthdayWish({
    //         email: decEmail,
    //         name: dataForBirthdayWish.name,
    //       });
    //       if (result.success) {
    //         await sendfcmNotification(
    //           doc.data().fcmToken,
    //           `Automatic birthday wish sent to your friend ${dataForBirthdayWish.name} `,
    //           'Email Reminder',
    //         );
    //         // await sendNotification(
    //         //   doc.data().fcmToken,
    //         //   result.message,
    //         //   'Birthday Reminder',
    //         // );
    //         console.log('✅ Success:', result.message);
    //       }
    //     } else {
    //       await sendfcmNotification(
    //         doc.data().fcmToken,
    //         ' Automatic birthday wish not delivered.Email not added.Tap "Wish Now" to send it manually',
    //         'Email Reminder',
    //       );
    //     }
    // //---------------------ai porjont age chilo
    const message = `🎂 Today is ${doc.data().name}'s birthday! 🎉`;
    // const todayStr = new Date().toISOString().split('T')[0];
    const data = await sendNotification(
      doc.data().fcmToken,
      message,
      'Birthday Reminder',
    );
    if (data) {
      await doc.ref.update({'lastNotified.birthday': todayStr});
    }
  }

  for (const doc of oneDaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();
    const prevSaveYear = Number(
      doc.data().lastNotified?.onedays?.split('-')[0],
    );
    if (
      doc.data().lastNotified.onedays != null &&
      prevSaveYear >= Currentyear
    ) {
      continue;
    }
    const message = `🎈 Only 1 day left for ${doc.data().name}'s birthday!`;
    // এটি সার্ভারের UTC ডেটকে বাদ দিয়ে নিখুঁত ইন্ডিয়ান/বাংলাদেশী YYYY-MM-DD ফরম্যাট দেবে
    const tzDate = new Date(
      new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
    );
    const todayStr = tzDate.toLocaleDateString('en-CA');
    const data = await sendNotification(
      doc.data().fcmToken,
      message,
      'Birthday Reminder',
    );
    if (data) {
      await doc.ref.update({'lastNotified.onedays': todayStr});
    }
  }

  for (const doc of twoDaySnap.docs) {
    const date = new Date();
    const Currentyear = date.getFullYear();
    const prevSaveYear = Number(doc.data().lastNotified?.twoday?.split('-')[0]);
    if (doc.data().lastNotified.twoday != null && prevSaveYear >= Currentyear) {
      continue;
    }
    const message = `🎈 Only 2 day left for ${doc.data().name}'s birthday!`;
    // এটি সার্ভারের UTC ডেটকে বাদ দিয়ে নিখুঁত ইন্ডিয়ান/বাংলাদেশী YYYY-MM-DD ফরম্যাট দেবে
    const tzDate = new Date(
      new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}),
    );
    const todayStr = tzDate.toLocaleDateString('en-CA');

    await birthdayQueue.add(
      'birthday-job',
      {
        token: doc.data().fcmToken,
        message,
        heading: 'Birthday Reminder',
        docPath: doc.ref.path,
        type: 'twoday',
        todayStr,
      },
      {
        removeOnComplete: {age: 3600}, // সফল হওয়া মাত্রই বা সর্বোচ্চ ১ ঘণ্টার মধ্যে মুছে যাবে
        removeOnFail: {age: 86400}, // ফেইল হওয়া জব ২৪ ঘণ্টা পর অটো মুছে যাবে (যাতে লগ চেক করা যায়)
        keepLogs: 0, // কোনো বাড়তি মেমরি বা লগ রেডিসে রাখবে না
      },
    );
    // const data = await sendNotification(
    //   doc.data().fcmToken,
    //   message,
    //   'Birthday Reminder',
    // );
    // if (data) {
    //   await doc.ref.update({'lastNotified.twoday': todayStr});
    // }
  }
}

async function sendNotification(fcmToken, body, heading) {
  if (!body || !heading) {
    console.log('❌ Skip sending empty notification');
    return;
  }
  // console.log("hi");
  try {
    await messaging.send({
      token: fcmToken,
      // notification: {
      //   title: heading, // ✅ MUST be title
      //   body,
      // },
      data: {
        type: 'birthday',
        title: heading, // ✅ same
        body,
        id: Date.now().toString(),
      },
      android: {
        priority: 'high',
        // notification: {
        //   priority: 'max',
        // },
        ttl: 1000 * 60 * 60 * 24,
      },
      apns: {
        headers: {'apns-priority': '10'},
        payload: {
          aps: {alert: {title: heading, body}, sound: 'default', badge: 1},
        },
      },
    });
    console.log('✅ Notification sent');
    return true;
  } catch (err) {
    console.error('❌ Error sending notification', err.code || err.message);
    // 2. If the error is "token not registered" → app was uninstalled
    // if (err.code === 'messaging/registration-token-not-registered') {
    //   if (fcmToken) {
    //     // 3. Find ALL docs that have this same invalid token
    //     const snap = await db
    //       .collection('birthdays')
    //       .where('fcmToken', '==', fcmToken) // e.g. "token123"
    //       .get();

    //     if (!snap.empty) {
    //       // 4. Start a batch operation
    //       const batch = db.batch();

    //       // 5. Queue up deletes for each doc
    //       snap.forEach(doc => {
    //         console.log(`🗑️ Queued delete for ${doc.id} (${doc.data().name})`);
    //         batch.delete(doc.ref);
    //       });

    //       // 6. Commit batch delete
    //       await batch.commit();
    //       console.log(`🗑️ Deleted ${snap.size} docs for invalid token`);
    //     }
    //   }
    // }
    return false;
  }
}
// checkHolidays();
async function checkHolidays() {
  try {
    const today = new Date().toISOString().split('T')[0]; // "2026-01-01"
    const year = today.split('-')[0];
    const month = today.split('-')[1];
    console.log('🔍 Checking holiday for:', month);

    // 🔥 Get holiday doc
    const snapshot = await db
      .collection('Holidays')
      .doc(year)
      .collection('allHolidaysMonth')
      .doc(`${year}-${month}`)
      .collection('allHolidaysDay')
      .doc(today)
      .get();

    if (!snapshot.exists) {
      console.log('❌ No holiday today');
      return;
    }

    const data = snapshot.data();
    const events = data.events || [];

    if (events.length === 0) {
      console.log('❌ No events found');
      return;
    }

    // 🔥 Loop all events
    for (const event of events) {
      const title = `🎉 ${event.name}`;
      const body = event.description;

      if (!title || !body) {
        console.log('❌ Skip sending empty notification');
        return;
      }

      // 🚀 SEND TO TOPIC
      await admin.messaging().send({
        topic: 'holiday',
        notification: {
          title,
          body,
        },
        data: {
          title,
          body,
          type: 'holiday',
        },
      });

      console.log(`✅ Sent: ${event.name}`);
    }
  } catch (error) {
    console.error('❌ Error in holiday check:', error);
  }
}

// ===== Schedule job =====
cron.schedule(CRON_SCHEDULE, checkBirthdays, {
  timezone: TIMEZONE,
});
cron.schedule(CRON_SCHEDULE, checkHolidays, {
  timezone: TIMEZONE,
});
startBirthdayWorker();
// ===== Error handlers =====
app.use((req, res, next) => {
  const err = createError(404, 'Route not found');
  next(err);
});

app.use((err, req, res, next) => {
  return errorResponse(res, {
    statusCode: err.status || 500,
    message: err.message || 'Internal Server Error',
  });
});

// ===== Start server =====
app.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});
