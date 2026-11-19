
const express = require('express');
const router = express.Router();

const db = require('../config/db');
const { authMiddleware, checkRole } = require('../middleware/auth');


// Создание нового заказа
router.post('/', async (req, res) => {
    const { table_id, waiter_id, items } = req.body;

    if (!table_id || !waiter_id || !items || items.length === 0) {
        return res.status(400).json({
            message: 'Необходимо указать столик, официанта и блюда'
        });
    }

  
    for (const item of items) {
        if (!item.dish_id || !item.quantity || item.quantity <= 0) {
            return res.status(400).json({
                message: 'Некорректные данные блюд'
            });
        }
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();


        const [tables] = await connection.execute(
            'SELECT * FROM `Tables` WHERE tables_ID = ?',
            [table_id]
        );

        if (tables.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                message: 'Столик не найден'
            });
        }

        const [employees] = await connection.execute(
            `SELECT e.Employees_ID
             FROM Employees e
             JOIN \`Role\` r ON e.role_id = r.role_ID
             WHERE e.Employees_ID = ?
             AND r.role_name = 'Официант'`,
            [waiter_id]
        );

        if (employees.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                message: 'Указанный сотрудник не является официантом'
            });
        }

        const [statuses] = await connection.execute(
            `SELECT status_ID
             FROM order_status
             WHERE status_name = 'Новый'`
        );

        if (statuses.length === 0) {
            await connection.rollback();

            return res.status(500).json({
                message: 'Статус "Новый" не найден в базе'
            });
        }

        const status_id = statuses[0].status_ID;

        const [orderResult] = await connection.execute(
            `INSERT INTO orders
             (table_id, waiter_id, status_id)
             VALUES (?, ?, ?)`,
            [table_id, waiter_id, status_id]
        );

        const order_id = orderResult.insertId;

        let total = 0;

        for (const item of items) {
            const [dishes] = await connection.execute(
                `SELECT dish_ID, price
                 FROM dishes
                 WHERE dish_ID = ?
                 AND is_available = TRUE`,
                [item.dish_id]
            );

            if (dishes.length === 0) {
                throw new Error(
                    `Блюдо с ID ${item.dish_id} недоступно`
                );
            }

            const price = Number(dishes[0].price);
            const quantity = Number(item.quantity);

            total += price * quantity;

            await connection.execute(
                `INSERT INTO order_items
                 (order_id, dish_id, quantity, price_at_order, comment)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    order_id,
                    item.dish_id,
                    quantity,
                    price,
                    item.comment || null
                ]
            );
        }

        await connection.execute(
            `INSERT INTO order_status_history
             (order_id, employee_id, status_id)
             VALUES (?, ?, ?)`,
            [order_id, waiter_id, status_id]
        );

        await connection.execute(
            `UPDATE \`Tables\`
             SET table_status = 'Занят'
             WHERE tables_ID = ?`,
            [table_id]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Заказ успешно создан',
            order_id: order_id,
            table_id: table_id,
            waiter_id: waiter_id,
            status: 'Новый',
            total: total
        });

    } catch (error) {
        await connection.rollback();

        console.error('Ошибка создания заказа:', error);

        res.status(500).json({
            message: 'Ошибка при создании заказа',
            error: error.message
        });

    } finally {
        connection.release();
    }
});



// Получение активных заказов для кухни
router.get(
    '/kitchen',
    authMiddleware,
    checkRole('cook'),
    async (req, res) => {
        try {
            const cookId = req.user.employeeId;

            const [rows] = await db.execute(
                `SELECT
                    o.order_ID,
                    o.table_id,
                    t.table_number,
                    o.waiter_id,
                    w.login AS waiter_login,
                    o.cook_id,
                    o.created_at,
                    s.status_name,
                    oi.order_item_ID,
                    oi.dish_id,
                    d.dish_name,
                    oi.quantity,
                    oi.price_at_order,
                    oi.comment
                FROM orders o
                JOIN \`Tables\` t
                    ON o.table_id = t.tables_ID
                JOIN Employees w
                    ON o.waiter_id = w.Employees_ID
                JOIN order_status s
                    ON o.status_id = s.status_ID
                LEFT JOIN order_items oi
                    ON o.order_ID = oi.order_id
                LEFT JOIN dishes d
                    ON oi.dish_id = d.dish_ID
                WHERE s.status_name IN (
                    'Новый',
                    'Принят кухней',
                    'Готовится'
                )
                AND (o.cook_id IS NULL OR o.cook_id = ?)
                ORDER BY o.created_at ASC`,
                [cookId]
            );

            const ordersMap = new Map();

            for (const row of rows) {
                if (!ordersMap.has(row.order_ID)) {
                    ordersMap.set(row.order_ID, {
                        order_id: row.order_ID,
                        table_id: row.table_id,
                        table_number: row.table_number,
                        waiter_id: row.waiter_id,
                        waiter_login: row.waiter_login,
                        cook_id: row.cook_id,
                        created_at: row.created_at,
                        status: row.status_name,
                        items: []
                    });
                }

                if (row.order_item_ID) {
                    ordersMap.get(row.order_ID).items.push({
                        order_item_id: row.order_item_ID,
                        dish_id: row.dish_id,
                        dish_name: row.dish_name,
                        quantity: row.quantity,
                        price: row.price_at_order,
                        comment: row.comment
                    });
                }
            }

            res.json({
                orders: Array.from(ordersMap.values())
            });

        } catch (error) {
            console.error('Ошибка получения заказов кухни:', error);

            res.status(500).json({
                message: 'Ошибка при получении заказов'
            });
        }
    }
);



// Изменение статуса заказа поваром
router.patch(
    '/:id/status',
    authMiddleware,
    checkRole('cook'),
    async (req, res) => {
        const orderId = Number(req.params.id);
        const { status } = req.body;
        const cookId = req.user.employeeId;

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({
                message: 'Некорректный номер заказа'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

  
            const [orders] = await connection.execute(
                `SELECT
                    o.order_ID,
                    o.cook_id,
                    s.status_name
                FROM orders o
                JOIN order_status s
                    ON o.status_id = s.status_ID
                WHERE o.order_ID = ?
                FOR UPDATE`,
                [orderId]
            );

            if (orders.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    message: 'Заказ не найден'
                });
            }

            const order = orders[0];

        
            if (order.cook_id && order.cook_id !== cookId) {
                await connection.rollback();

                return res.status(403).json({
                    message: 'Этот заказ закреплен за другим поваром'
                });
            }

        
            const allowedTransitions = {
                'Новый': 'Принят кухней',
                'Принят кухней': 'Готовится',
                'Готовится': 'Готов'
            };

            const nextStatus = allowedTransitions[order.status_name];

            if (!nextStatus || status !== nextStatus) {
                await connection.rollback();

                return res.status(400).json({
                    message: `Нельзя изменить статус "${order.status_name}" на "${status}"`
                });
            }

            const [statuses] = await connection.execute(
                `SELECT status_ID
                 FROM order_status
                 WHERE status_name = ?`,
                [status]
            );

            if (statuses.length === 0) {
                await connection.rollback();

                return res.status(500).json({
                    message: 'Указанный статус не найден в базе'
                });
            }

            const statusId = statuses[0].status_ID;


            await connection.execute(
                `UPDATE orders
                 SET status_id = ?,
                     cook_id = ?
                 WHERE order_ID = ?`,
                [statusId, cookId, orderId]
            );


            await connection.execute(
                `INSERT INTO order_status_history
                 (order_id, employee_id, status_id)
                 VALUES (?, ?, ?)`,
                [orderId, cookId, statusId]
            );

            await connection.commit();

            res.json({
                message: 'Статус заказа успешно изменён',
                order_id: orderId,
                old_status: order.status_name,
                new_status: status
            });

        } catch (error) {
            await connection.rollback();

            console.error('Ошибка изменения статуса:', error);

            res.status(500).json({
                message: 'Ошибка при изменении статуса заказа'
            });

        } finally {
            connection.release();
        }
    }
    
);

// Получение заказов официанта
router.get(
    '/',
    authMiddleware,
    checkRole('waiter'),
    async (req, res) => {
        try {
            const waiterId = req.user.employeeId;

            const [rows] = await db.execute(
                `SELECT
                    o.order_ID,
                    o.table_id,
                    t.table_number,
                    o.created_at,
                    o.updated_at,
                    s.status_name,
                    oi.order_item_ID,
                    oi.dish_id,
                    d.dish_name,
                    oi.quantity,
                    oi.price_at_order,
                    oi.comment
                FROM orders o
                JOIN \`Tables\` t
                    ON o.table_id = t.tables_ID
                JOIN order_status s
                    ON o.status_id = s.status_ID
                LEFT JOIN order_items oi
                    ON o.order_ID = oi.order_id
                LEFT JOIN dishes d
                    ON oi.dish_id = d.dish_ID
                WHERE o.waiter_id = ?
                ORDER BY o.created_at DESC`,
                [waiterId]
            );

            const ordersMap = new Map();

            for (const row of rows) {
                if (!ordersMap.has(row.order_ID)) {
                    ordersMap.set(row.order_ID, {
                        order_id: row.order_ID,
                        table_id: row.table_id,
                        table_number: row.table_number,
                        created_at: row.created_at,
                        updated_at: row.updated_at,
                        status: row.status_name,
                        items: []
                    });
                }

                if (row.order_item_ID) {
                    ordersMap.get(row.order_ID).items.push({
                        order_item_id: row.order_item_ID,
                        dish_id: row.dish_id,
                        dish_name: row.dish_name,
                        quantity: row.quantity,
                        price: row.price_at_order,
                        comment: row.comment
                    });
                }
            }

            res.json({
                orders: Array.from(ordersMap.values())
            });

        } catch (error) {
            console.error('Ошибка получения заказов официанта:', error);

            res.status(500).json({
                message: 'Ошибка при получении заказов'
            });
        }
    }
);


module.exports = router;
