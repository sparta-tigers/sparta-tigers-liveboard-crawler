import Redis from "ioredis";

let redisPublisher = null;

export function initRedis() {
    if (redisPublisher) {
        return;

    }

    redisPublisher = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT)
    });

    redisPublisher.on('connect', () => {
        console.log('Redis 연결 성공');
    });

    redisPublisher.on('error', (err) => {
        console.error('Redis Publisher 클라이언트 오류:', err);
    });
}

export function getRedisPublisher() {
    return redisPublisher;
}