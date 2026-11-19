
const express = require('express');
const router = express.Router();

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Авторизация сотрудника
 *     description: Проверка логина и пароля сотрудника и получение JWT-токена
 *     tags: [Авторизация]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - login
 *               - password
 *             properties:
 *               login:
 *                 type: string
 *                 example: waiter1
 *               password:
 *                 type: string
 *                 example: waiter123
 *     responses:
 *       200:
 *         description: Авторизация успешна
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Авторизация успешна
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 employee:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     login:
 *                       type: string
 *                       example: waiter1
 *                     role:
 *                       type: string
 *                       example: waiter
 *       400:
 *         description: Не введены логин или пароль
 *       401:
 *         description: Неверный логин или пароль
 *       500:
 *         description: Ошибка сервера
 */
router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).json({
                message: 'Введите логин и пароль'
            });
        }

        const [employees] = await db.execute(
            `SELECT
                e.Employees_ID,
                e.login,
                e.password,
                r.role_name
            FROM Employees e
            JOIN \`Role\` r
                ON e.role_id = r.role_ID
            WHERE e.login = ?`,
            [login]
        );

        if (employees.length === 0) {
            return res.status(401).json({
                message: 'Неверный логин или пароль'
            });
        }

        const employee = employees[0];

        const passwordIsValid = await bcrypt.compare(
            password,
            employee.password
        );

        if (!passwordIsValid) {
            return res.status(401).json({
                message: 'Неверный логин или пароль'
            });
        }

        let role;

        if (employee.role_name === 'Официант') {
            role = 'waiter';
        } else if (employee.role_name === 'Повар') {
            role = 'cook';
        } else {
            role = 'unknown';
        }

        const token = jwt.sign(
            {
                employeeId: employee.Employees_ID,
                login: employee.login,
                role: role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        res.json({
            message: 'Авторизация успешна',
            token: token,
            employee: {
                id: employee.Employees_ID,
                login: employee.login,
                role: role
            }
        });

    } catch (error) {
        console.error('Ошибка авторизации:', error);

        res.status(500).json({
            message: 'Ошибка сервера при авторизации'
        });
    }
});

module.exports = router;
