import {loadEnv} from "./src/config.mjs";
import {getTodayMatches, initializeKnex} from "./src/db.js";
import {startLiveBoard} from "./src/liveboard_crawler.js";
import {initRedis} from "./src/redis.js";

async function start() {
    loadEnv();
    initializeKnex();
    initRedis();

    const matches = await getTodayMatches();
    await startLiveBoard(matches);
}

start();