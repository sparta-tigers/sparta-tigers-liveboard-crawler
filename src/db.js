import knex from 'knex';

let connectionInstance = null;

export function initializeKnex() {
    if (connectionInstance) {
        return connectionInstance;
    }

    const DB_CONFIG = {
        client: 'mysql2',
        connection: {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        },
        pool: {
            min: 1,
            max: 10 // 보통 10개 정도로 설정하는 것이 일반적입니다.
        }
    };

    connectionInstance = knex(DB_CONFIG);
    return connectionInstance;
}

export async function getTodayMatches() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        today.setDate(today.getDate() - 1); // TODO 테스트용 지울 예정

        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        return connectionInstance('matches as m')
            .select(
                'm.id AS match_id',
                'at.name AS away_team_name',
                'at.code AS away_team_code',
                'ht.name AS home_team_name',
                'ht.code AS home_team_code',
                'm.match_time AS match_time'
            )
            .join('teams as at', 'm.away_team_id', '=', 'at.id')
            .join('teams as ht', 'm.home_team_id', '=', 'ht.id')
            .where('m.match_time', '>=', today)
            .andWhere('m.match_time', '<', tomorrow);
    } catch (error) {
        console.error('오늘 경기 데이터 조회중 요류 발생:', error.message);
        throw error;
    }
}
