import axios from 'axios';
import express from 'express';
import {successResponse} from './ErrorSuccessResponse.js';
import db from '../helper/fireBase.js';

const app = express();
app.use(express.json());

export const AllEvent = async (req, res, next) => {
  const {data} = req.body;
  // console.log(data);
  const today = new Date();
  const fullDate = today.toISOString().split('T')[0];
  const year = fullDate.split('-')[0];
  const month = fullDate.split('-')[1];
  // console.log(year);
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
        return;
      }
      // console.log(snapshot.docs.data());
      let mainData = [];

      snapshot.forEach(doc => {
        mainData.push(...(doc.data().events || []));
      });
      successResponse(res, {
        statusCode: 200,
        message: 'Holiday found successfully 🎉',
        payload: {mainData},
      });
    } else if (data === 'Year') {
      const snapshot = await db.collectionGroup('allHolidaysDay').get();

       if (snapshot.empty) {
        successResponse(res, {
          statusCode: 200,
          message: ' No Holiday found  🎉',
          payload: {},
        });
        return;
      }
      let mainData=[];
      snapshot.docs.forEach(doc => {
        mainData.push(... doc.data().events);
      });
      // console.log(data); 
      successResponse(res, {
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
