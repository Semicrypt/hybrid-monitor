const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Database = require('better-sqlite3');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* =======================
   🔐 TELEGRAM CONFIG
   ======================= */
const TELEGRAM_TOKEN = "8548631177:AAGQtd3BUbZbXaaPzOSt6hbke6d4thnKOqA";
const CHAT_ID = "6789591477";

/* =======================
   DATABASE
   ======================= */
const db = new Database('monitor.db');

db.prepare(`
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
`).run();

/* =======================
   TELEGRAM ALERT FUNCTION
   ======================= */
async function sendAlert(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message
            })
        });
    } catch (err) {
        console.log("Telegram error:", err.message);
    }
}

/* =======================
   STATE TRACKING
   ======================= */
const serviceState = {};

/* =======================
   ADD SERVICE
   ======================= */
app.post('/services', (req, res) => {
    const { name, url } = req.body;

    const stmt = db.prepare(`
        INSERT INTO services (name, url)
        VALUES (?, ?)
    `);

    const result = stmt.run(name, url);

    emitUpdate();

    res.json({
        message: "Service added",
        serviceId: result.lastInsertRowid
    });
});

/* =======================
   DASHBOARD
   ======================= */
app.get('/dashboard', (req, res) => {
    res.json(db.prepare(`SELECT * FROM services`).all());
});

/* =======================
   MONITORING ENGINE
   ======================= */
function checkServices() {
    const services = db.prepare(`SELECT * FROM services`).all();

    for (const service of services) {

        const start = Date.now();

        axios.get(service.url, { timeout: 5000 })
        .then(async () => {

            const wasDown = serviceState[service.id] === "DOWN";
            serviceState[service.id] = "UP";

            const responseTime = Date.now() - start;

            const total = service.total_checks + 1;
            const failed = service.failed_checks;

            const uptime = ((total - failed) / total) * 100;

            db.prepare(`
                UPDATE services
                SET status='UP',
                    response_time=?,
                    total_checks=?,
                    uptime=?
                WHERE id=?
            `).run(responseTime, total, uptime, service.id);

            if (wasDown) {
                await sendAlert(`✅ RECOVERED\n${service.name}\n${service.url}`);
            }

            emitUpdate();
        })

        .catch(async () => {

            const wasUp = serviceState[service.id] !== "DOWN";
            serviceState[service.id] = "DOWN";

            const total = service.total_checks + 1;
            const failed = service.failed_checks + 1;

            const uptime = ((total - failed) / total) * 100;

            db.prepare(`
                UPDATE services
                SET status='DOWN',
                    total_checks=?,
                    failed_checks=?,
                    uptime=?
                WHERE id=?
            `).run(total, failed, uptime, service.id);

            if (wasUp) {
                await sendAlert(`🚨 DOWN\n${service.name}\n${service.url}`);
            }

            emitUpdate();
        });
    }
}

/* =======================
   SOCKET.IO
   ======================= */
function emitUpdate() {
    const data = db.prepare(`SELECT * FROM services`).all();
    io.emit('update', data);
}

io.on('connection', (socket) => {
    socket.emit('update', db.prepare(`SELECT * FROM services`).all());
});

/* =======================
   START
   ======================= */
setInterval(checkServices, 10000);

server.listen(5000, () => {
    console.log("Server running on port 5000");
});
