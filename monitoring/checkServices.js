const axios = require('axios');
const db = require('../config/db');

async function checkServices() {

    const sql = 'SELECT * FROM services';

    db.query(sql, async (err, services) => {

        if (err) {
            console.log(err);
            return;
        }

        for (const service of services) {

            const start = Date.now();

            try {

                await axios.get(service.url);

                const responseTime = Date.now() - start;

                const updateSql = `
                    UPDATE services
                    SET status = ?, response_time = ?, last_checked = NOW()
                    WHERE id = ?
                `;

                db.query(updateSql,
                    ['UP', responseTime, service.id]);

                const logSql = `
                    INSERT INTO logs(service_id, status, response_time)
                    VALUES (?, ?, ?)
                `;

                db.query(logSql,
                    [service.id, 'UP', responseTime]);

                console.log(`${service.name} is UP`);

            } catch (error) {

                const updateSql = `
                    UPDATE services
                    SET status = ?, response_time = ?, last_checked = NOW()
                    WHERE id = ?
                `;

                db.query(updateSql,
                    ['DOWN', 0, service.id]);

                const logSql = `
                    INSERT INTO logs(service_id, status, response_time)
                    VALUES (?, ?, ?)
                `;

                db.query(logSql,
                    [service.id, 'DOWN', 0]);

                console.log(`${service.name} is DOWN`);
            }
        }
    });
}

module.exports = checkServices;
