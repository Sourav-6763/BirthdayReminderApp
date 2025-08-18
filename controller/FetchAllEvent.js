const axios = require('axios');
const {successResponse} = require('./ErrorSuccessResponse');

const AllEvent = async (req, res, next) => {
  const {data} = req.body;
  console.log(data);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  let params = {
    api_key: process.env.ALL_EVENT,
    country: 'IN',
    year,
  };
  try {
    if (data === 'Today') {
      params.month = month;
      params.day = day;
    } else if (data === 'Month') {
      params.month = month;
    }

    const response = await axios.get(
      'https://calendarific.com/api/v2/holidays',
      {
        params,
      },
    );
    const holidays = response.data.response.holidays;

    if (holidays.length === 0) {
      return successResponse(res, {
        statusCode: 200,
        message: 'No holidays today 🎈',
        payload: [],
      });
    }

    return successResponse(res, {
      statusCode: 200,
      message: 'Holidays found 🎉',
      payload: holidays,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {AllEvent};
