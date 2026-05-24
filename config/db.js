const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'monitoruser',
    password: 'monitor123',
    database: 'hybrid_monitoring'
});

connection.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }

    console.log('MySQL Connected...');
});

module.exports = connection;
