// redis.js
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const connection = new IORedis(process.env.REDIS_TCP_URL,{
   maxRetriesPerRequest:null
});

export default connection;