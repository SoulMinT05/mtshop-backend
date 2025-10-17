import Redis from 'redis';

const redisConfig = Redis.createClient();

redisConfig.on('error', (err) => console.log('Redis Client Error', err));

await redisConfig.connect();

// wrapper setex
redisConfig.setex = async (key, ttl, value) => {
    return redisConfig.set(key, value, { EX: ttl });
};

export default redisConfig;
