import puppeteer from "puppeteer-core";
import {getRedisPublisher} from "./redis.js";

/**
 * 주어진 경기 데이터 배열을 기반으로 각 경기의 라이브보드 URL을 생성
 *
 * @param {Array<Object>} matches - 오늘 경기 데이터 배열. 각 객체는 다음과 같은 속성을 포함
 * - match_id: 경기 고유 ID (Number)
 * - away_team_name: 원정팀 이름 (String)
 * - away_team_code: 원정팀 코드 (String)
 * - home_team_name: 홈팀 이름 (String)
 * - home_team_code: 홈팀 코드 (String)
 * - match_time: 경기 시간 (Date 객체 또는 Date로 변환 가능한 문자열)
 * @returns {Array<Object>} 각 경기의 라이브보드 URL과 함께 원본 경기 데이터를 포함하는 배열.
 * 각 객체는 { match_id, away_team_name, ..., liveboardUrl } 형태
 */
function generateLiveBoardUrls(matches) {
    const baseUrl = "https://www.koreabaseball.com/Game/LiveText.aspx";
    const generatedUrls = [];

    matches.forEach(match => {
        const matchTime = new Date(match.match_time);
        const year = matchTime.getFullYear();
        const month = (matchTime.getMonth() + 1).toString().padStart(2, '0');
        const day = matchTime.getDate().toString().padStart(2, '0');

        const yyyymmdd = `${year}${month}${day}`; // YYYYMMDD 형식
        const homeTeamCode = match.home_team_code;
        const awayTeamCode = match.away_team_code;

        // gameId 구성: YYYYMMDD + 어웨이 코드 + 홈팀 코드 + "0"
        const gameId = `${yyyymmdd}${awayTeamCode}${homeTeamCode}0`;

        // 최종 URL 구성
        const liveBoardUrl = `${baseUrl}?leagueId=1&seriesId=0&gameId=${gameId}&gyear=${year}`;

        generatedUrls.push({
            ...match,
            liveBoardUrl
        });
    });

    return generatedUrls;
}

async function crawlLiveBoardData(page, matchWithUrl) {
    try {
        console.log(`[${matchWithUrl.match_id}] 라이브보드 크롤링 시작: ${matchWithUrl.liveBoardUrl}`);
        const redis = getRedisPublisher();

        const crawledData = await page.evaluate(() => {
            const players = [];
            const playerList = document.querySelectorAll('.playerName ul li');

            playerList.forEach(li => {
                const role = li.className;
                const name = li.innerText.trim();
                players.push({role, name});
            });

            const liveBoardMessages = [];
            const allNumConts = document.querySelectorAll('.broadcast .numCon');

            allNumConts.forEach(numCont => {
                const liveTextSpans = numCont.querySelectorAll('span.normaiflTxt, span.blue, span.red');
                liveTextSpans.forEach(span => {
                    let text = span.textContent.trim();
                    if (text === '' || text === '-' || text === '---------------------------------------') {
                        return;
                    }
                    text = text.replace(/\s+/g, ' ').trim();
                    const type = span.className;
                    const sourceId = numCont.id;
                    liveBoardMessages.push({sourceId, type, content: text});
                });
            });

            const strike = document.querySelectorAll('.sbo .s li.on').length;
            const ball = document.querySelectorAll('.sbo .b li.on').length;
            const out = document.querySelectorAll('.sbo .o li.on').length;
            const matchScore = {strike, ball, out};

            return {players, liveBoardMessages, matchScore};
        });

        const channel = `live_board:${matchWithUrl.match_id}`;
        const message = JSON.stringify({ ...crawledData, match_id: matchWithUrl.match_id });
        await redis.publish(channel, message);

        console.log(`live_board:${matchWithUrl.match_id} 크롤링 완료, 메시지 전송 완료`)
        return { success: true, data: crawledData };
    } catch (error) {
        console.error(`[${matchWithUrl.match_id}] 데이터 크롤링 중 오류 발생:`, error);
        return { success: false, error: error };
    }
}

export async function startLiveBoard(matches) {
    const matchesWithUrl = generateLiveBoardUrls(matches);

    if (matchesWithUrl.length === 0) {
        console.warn('크롤링할 경기가 없습니다.');
        return;
    }

    let browser;
    const crawlingTasks = new Map(); // 크롤링 작업 아이디 별로 page인스턴스 관리
    const repeatInterval = 5000;

    try {
        console.log('브라우저 기동');
        browser = await puppeteer.launch({
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            executablePath: process.env.CHROMIUM_PATH,
            headless: true,
        });

        // 경기별 페이지를 열고 크롤링 시작
        for (const match of matchesWithUrl) {
            const page = await browser.newPage();
            console.log(`[${match.match_id}] 페이지 로드 시작: ${match.liveBoardUrl}`);
            try {
                await page.goto(match.liveBoardUrl, { waitUntil: 'domcontentloaded' });
                console.log(`[${match.match_id}] 페이지 로드 완료: ${await page.title()}`);

                // 각 페이지별로 독립적인 setInterval 설정
                const intervalId = setInterval(async () => {
                    const result = await crawlLiveBoardData(page, match); // 페이지와 경기 정보 전달
                    if (!result.success) {
                        // 크롤링 실패 시 해당 페이지 닫고 interval 중지
                        console.error(`[${match.match_id}] 크롤링 실패로 해당 페이지 종료.`);
                        clearInterval(crawlingTasks.get(match.match_id).intervalId);
                        await crawlingTasks.get(match.match_id).page.close();
                        crawlingTasks.delete(match.match_id); // 맵에서 제거

                        // 모든 경기가 종료되었는지 확인 (선택 사항: 모든 경기 종료 시 브라우저 닫기)
                        if (crawlingTasks.size === 0) {
                            console.log("모든 경기 크롤링이 종료되었습니다. 브라우저를 닫습니다.");
                            await browser.close();
                            // process.exit(0); // 필요시 프로세스 종료
                        }
                    }
                }, repeatInterval);

                crawlingTasks.set(match.match_id, { page, intervalId });
                console.log(`[${match.match_id}] 라이브보드 크롤링 시작: ${match.liveBoardUrl}`);

            } catch (pageError) {
                console.error(`[${match.match_id}] 페이지 초기화 또는 로드 중 오류 발생:`, pageError);
                await page.close(); // 오류 발생한 페이지는 닫음
            }
        }

        if (crawlingTasks.size === 0) {
            console.warn("시작할 수 있는 크롤링 작업이 하나도 없습니다. 브라우저를 닫습니다.");
            await browser.close();
            return;
        }

        console.log(`총 ${crawlingTasks.size}개의 경기 크롤링을 시작합니다.`);
        console.log("Ctrl+C를 눌러 모든 크롤링을 중지할 수 있습니다.");

    } catch (initialError) {
        console.error("브라우저 기동 실패:", initialError);
        if (browser) {
            await browser.close();
        }
        process.exit(1);
    }

    // 애플리케이션 종료 시 모든 탭과 브라우저를 깔끔하게 닫도록 처리
    process.on('SIGINT', async () => {
        console.log('크롤링 종료 및 브라우저 종료 시작');

        for (const [matchId, task] of crawlingTasks.entries()) {
            if (task.intervalId) {
                clearInterval(task.intervalId);
                console.log(`[${matchId}] 크롤링 Interval 중지.`);
            }

            if (task.page && !task.page.isClosed()) {
                await task.page.close();
                console.log(`[${matchId}] 페이지 닫음.`);
            }
        }
        crawlingTasks.clear();

        if (browser && !browser.isClosed()) {
            await browser.close();
            console.log("브라우저 종료");
        }
        process.exit(0);
    });
}
