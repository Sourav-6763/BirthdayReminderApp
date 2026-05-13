import {Queue} from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import connection from "./redisconfig.js";

dotenv.config();

export const birthdayQueue = new Queue('birthdayQueue',{connection} );
