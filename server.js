const fs = require('fs')

try {
  fs.unlinkSync('./monitoring.db')
  console.log('Old DB removed')
} catch (e) {
  console.log('No old DB found')
}

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ================= DATABASE ================= */
const db = new sqlite3.Database('./monitor.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            url TEXT,
            status TEXT DEFAULT 'UNKNOWN',
            response_time INTEGER DEFAULT 0,
            total_checks INTEGER DEFAULT 0,
            failed_checks INTEGER DEFAULT 0,
            uptime REAL DEFAULT 100
        )
    `);
});

/* ================= TELEGRAM (OPTIONAL) ================= */
const TELEGRAM_TOKEN = "";
const CHAT_ID = "";

async function sendAlert(message) {
    if (!TELEGRAM_TOKEN || !CHAT_ID) return;

    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
                chat_id: CHAT_ID,
                text: message
            }
        );
    } catch (err) {
        console.log("Telegram error");
    }
}

/* ================= STATE ================= */
const serviceState = {};

/* ================= ADD SERVICE ================= */
app.post('/services', (req, res) => {
    const { name, url } = req.body;

    db.run(
        `INSERT INTO services (name, url) VALUES (?, ?)`,
        [name, url],
        function () {
            emitUpdate();
            res.json({ message: "Service added", id: this.lastID });
        }
    );
});

/* ================= DASHBOARD ================= */
app.get('/dashboard', (req, res) => {
    db.all(`SELECT * FROM services`, [], (err, rows) => {
        res.json(rows);
    });
});

/* ================= MONITOR ================= */
function checkServices() {
    db.all(`SELECT * FROM services`, [], (err, services) => {

        services.forEach(service => {

            const start = Date.now();

            axios.get(service.url, { timeout: 5000 })
                .then(async () => {

                    const responseTime = Date.now() - start;

                    const total = service.total_checks + 1;
                    const failed = service.failed_checks;

                    const uptime = ((total - failed) / total) * 100;

                    db.run(`
                        UPDATE services
                        SET status='UP',
                            response_time=?,
                            total_checks=?,
                            uptime=?
                        WHERE id=?
                    `, [responseTime, total, uptime, service.id]);

                    if (serviceState[service.id] === "DOWN") {
                        await sendAlert(`✅ RECOVERED: ${service.name}`);
                    }

                    serviceState[service.id] = "UP";

                    emitUpdate();
                })
                .catch(async () => {

                    const total = service.total_checks + 1;
                    const failed = service.failed_checks + 1;

                    const uptime = ((total - failed) / total) * 100;

                    db.run(`
                        UPDATE services
                        SET status='DOWN',
                            total_checks=?,
                            failed_checks=?,
                            uptime=?
                        WHERE id=?
                    `, [total, failed, uptime, service.id]);

                    if (serviceState[service.id] !== "DOWN") {
                        await sendAlert(`🚨 DOWN: ${service.name}`);
                    }

                    serviceState[service.id] = "DOWN";

                    emitUpdate();
                });
        });
    });
}

/* ================= SOCKET ================= */
function emitUpdate() {
    db.all(`SELECT * FROM services`, [], (err, rows) => {
        io.emit('update', rows);
    });
}

io.on('connection', (socket) => {
    db.all(`SELECT * FROM services`, [], (err, rows) => {
        socket.emit('update', rows);
    });
});

/* ================= START ================= */
setInterval(checkServices, 10000);

server.listen(5000, () => {
    console.log("Server running on port 5000");
});
