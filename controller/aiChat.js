const {GoogleGenAI} = require('@google/genai');
const {successResponse, errorResponse} = require('./ErrorSuccessResponse');
const ai = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY});

const quickAns = async (req, res, next) => {
  const text = req.body.q;
  try {
    if (!text) {
      return errorResponse(res, {
        statusCode: 400,
        message: 'please type ',
        payload: {},
      });
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Answer concisely in 2-3 sentences: ${text}`,
    });

    const output = response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!output) {
      return res.status(500).json({error: 'No response from Gemini API'});
    }

    return successResponse(res, {
      statusCode: 200,
      message: 'Successful',
      payload: output,
    });
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return res
      .status(500)
      .json({error: 'Failed to fetch response from Gemini'});
  }
};
module.exports = {quickAns};
