import admin from 'firebase-admin';
import {Worker} from 'bullmq';

import connection from './redisconfig.js';
import {sendfcmNotification} from './sendfcmNotification.js';
import {autoSendBirthdayWish} from '../controller/AutoBirthdayWish.js';

export function startBirthdayWorker() {
  const worker = new Worker(
    'birthdayQueue',
    async job => {
      const {token, email, name, message, heading, docPath, type, todayStr} =
        job.data;
      // console.log('📦 Data:', job.data);
      if (type === 'email') {
        const emailResult = await autoSendBirthdayWish({email, name});
        if (emailResult.success) {
          await sendfcmNotification(
            token,
            `Automatic birthday wish sent to your friend ${name}`,
            'Email Reminder',
          );
        } else {
          await sendfcmNotification(
            token,
            `Automatic birthday wish not delivered.Email not added.Tap "Wish Now" to send it manually`,
            'Email Reminder',
          );
        }
        return;
      }
      const success = await sendfcmNotification(token, message, heading);

      if (success) {
        await admin
          .firestore()
          .doc(docPath)
          .update({
            [`lastNotified.${type}`]: todayStr,
          });

        console.log('DB updated');
      }
      console.log('✅ Done job ID:', job.id);
    },

    {
      connection,
     stalledInterval: 600000, // ⏱️ ১০ মিনিট পর পর স্টলড জব চেক করবে
      lockDuration: 600000,
    },
  );
  return worker;
}
console.log('✅ Birthday worker started');

