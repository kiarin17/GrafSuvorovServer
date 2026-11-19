const express = require('express');
const router = express.Router();

const db = require('../config/db');


router.get('/categories', async (req, res) => {
    try {
        const [categories] = await db.query(
            'SELECT * FROM categories ORDER BY category_ID'
        );

        res.json(categories);

    } catch (error) {
        console.error('Ошибка получения категорий:', error);

        res.status(500).json({
            message: 'Ошибка получения категорий'
        });
    }
});


router.get('/dishes', async (req, res) => {
    try {
        const [dishes] = await db.query(`
            SELECT
                d.dish_ID,
                d.dish_name,
                d.description,
                d.price,
                d.is_available,
                c.category_ID,
                c.category_name
            FROM dishes d
            JOIN categories c
                ON d.category_id = c.category_ID
            WHERE d.is_available = TRUE
            ORDER BY c.category_ID, d.dish_name
        `);

        res.json(dishes);

    } catch (error) {
        console.error('Ошибка получения блюд:', error);

        res.status(500).json({
            message: 'Ошибка получения блюд'
        });
    }
});

module.exports = router;