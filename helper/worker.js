import admin from 'firebase-admin';
import {Worker} from 'bullmq';
import IORedis from 'ioredis';
import sendfcmNotification from './sentFcmNotification.js';
import connection from './redisconfig.js';

const worker = new Worker(
  'birthdayQueue',
  async job => {
    const {token, message, heading, docPath, type, todayStr} = job.data;
    if (type === 'email') {
    //   console.log('this is email');
      await sendfcmNotification(token, message, heading);
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

      //   console.log('DB updated');
    }
  },
  {connection},
);
