import Redis from 'redis';

const isProd = process.env.NODE_ENV === 'production';
const redisHost = isProd ? process.env.REDIS_HOST : 'localhost';
const redisPort = process.env.REDIS_PORT;

const redisConfig = Redis.createClient({
    socket: {
        host: redisHost,
        port: redisPort,
    },
});

redisConfig.on('error', (err) => console.log('Redis Client Error', err));

await redisConfig.connect();

// wrapper setex
redisConfig.setex = async (key, ttl, value) => {
    return redisConfig.set(key, value, { EX: ttl });
};

export default redisConfig;
