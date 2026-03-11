const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'M_desha.1744', 
    server: '127.0.0.1', 
    port: 1433,
    database: 'Egypt Voting System', 
    options: {
        encrypt: false, 
        trustServerCertificate: true
    }
};

// أهم سطر: بنصدر الـ sql والـ config عشان app.js يشوفهم
module.exports = { sql, config };