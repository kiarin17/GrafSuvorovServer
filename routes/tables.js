const express = require('express');
const router = express.Router();

const db = require('../config/db');

router.get('/', async (req, res) => {
    try {
        const [tables] = await db.query(
            'SELECT * FROM `Tables` ORDER BY table_number'
        );

        res.json(tables);

    } catch (error) {
        console.error('Ошибка получения столиков:', error);

        res.status(500).json({
            message: 'Ошибка получения списка столиков'
        });
    }
});

module.exports = router;