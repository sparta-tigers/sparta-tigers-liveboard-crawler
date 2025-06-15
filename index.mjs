import {loadEnv} from "./config.mjs";
import {getTodayMatches, initializeKnex} from "./db.js";
import {startLiveBoard} from "./liveboard_crawler.js";
import {initRedis} from "./redis.js";

async function start() {
    loadEnv();
    initializeKnex();
    initRedis();

    const matches = await getTodayMatches();
    await startLiveBoard(matches);
}

start();