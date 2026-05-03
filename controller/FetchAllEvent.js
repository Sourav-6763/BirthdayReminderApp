import axios from 'axios';
import express from 'express';
import {successResponse} from './ErrorSuccessResponse.js';
import db from '../helper/fireBase.js';
import {redis} from '../helper/redis.js';

const app = express();
app.use(express.json());

export const AllEvent = async (req, res, next) => {
  const {data} = req.body;
  // console.log(data);
  const today = new Date();
  const fullDate = today.toISOString().split('T')[0];
  const year = fullDate.split('-')[0];
  const month = fullDate.split('-')[1];
  const key = `events_${data}_${fullDate}`;
  // await redis.del(key);
  try {
    const cache = await redis.get(key);
    if (cache) {
      return successResponse(res, {
        statusCode: 200,
        message: 'Holiday found successfully from cache 🎉',
        payload: {mainData: cache},
      });
    }
  } catch (error) {
    console.log('Redis SET error:', error.message);
  }
  // await redis.del(key);

  try {
    if (data === 'Today') {
      const snapshort = await db
        .collection('Holidays')
        .doc(year)
        .collection('allHolidaysMonth')
        .doc(`${year}-${month}`)
        .collection('allHolidaysDay')
        .doc(fullDate)
        .get();
      const actualData = snapshort.data();

      const mainData = actualData?.events || [];

      if (mainData.length === 0) {
        return successResponse(res, {
          statusCode: 200,
          message: 'No Holidays found',
          payload: {mainData: []},
        });
      }
       try {
        await redis.set(key, JSON.stringify(mainData), {ex: 86400});
      } catch (err) {
        console.log('Redis SET error:', err.message);
      }
      // console.log(mainData);
      return successResponse(res, {
        statusCode: 200,
        message: 'Holiday found successfully 🎉',
        payload: {mainData},
      });
    } else if (data === 'Month') {
      const snapshot = await db
        .collection('Holidays')
        .doc(year)
        .collection('allHolidaysMonth')
        .doc(`${year}-${month}`)
        .collection('allHolidaysDay')
        .get();

      if (snapshot.empty) {
        successResponse(res, {
          statusCode: 200,
          message: ' No Holiday found  🎉',
          payload: {},
        });
      }
      // console.log(snapshot.docs.data());
      let mainData = [];

      snapshot.forEach(doc => {
        mainData.push(...(doc.data().events || []));
      });
      try {
        await redis.set(key, JSON.stringify(mainData), {ex: 864000});
      } catch (err) {
        console.log('Redis SET error:', err.message);
      }

      // await redis.set(key, JSON.stringify(mainData), {ex: 864000});
      return successResponse(res, {
        statusCode: 200,
        message: 'Holiday found successfully 🎉',
        payload: {mainData},
      });
    } else if (data === 'Year') {
      const snapshot = await db.collectionGroup('allHolidaysDay').get();

      if (snapshot.empty) {
        return successResponse(res, {
          statusCode: 200,
          message: ' No Holiday found  🎉',
          payload: {},
        });
      }
      let mainData = [];
      snapshot.docs.forEach(doc => {
        mainData.push(...doc.data().events);
      });
      try {
        await redis.set(key, JSON.stringify(mainData), {ex: 864000});
      } catch (err) {
        console.log('Redis SET error:', err.message);
      }
      // console.log(data);
      return successResponse(res, {
        statusCode: 200,
        message: 'Holiday found successfully 🎉',
        payload: {mainData},
      });
    }
  } catch (error) {
    next(error);
  }

  // const year = 2026;
  // const month1 = '02'; // January
};
