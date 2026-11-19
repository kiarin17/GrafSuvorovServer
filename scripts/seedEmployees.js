
const db = require('../config/db');
const bcrypt = require('bcryptjs');

async function createEmployees() {
    try {
        const [roles] = await db.query(
            'SELECT * FROM `Role`'
        );

        const waiterRole = roles.find(
            role => role.role_name === 'Официант'
        );

        const cookRole = roles.find(
            role => role.role_name === 'Повар'
        );

        if (!waiterRole || !cookRole) {
            console.log('Роли не найдены. Сначала заполните таблицу Role.');
            return;
        }


        const waiterPassword = await bcrypt.hash('waiter123', 10);
        const cookPassword = await bcrypt.hash('cook123', 10);

  
        await db.execute(
            `INSERT INTO Employees (role_id, login, password)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE login = login`,
            [waiterRole.role_ID, 'waiter1', waiterPassword]
        );

        await db.execute(
            `INSERT INTO Employees (role_id, login, password)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE login = login`,
            [cookRole.role_ID, 'cook1', cookPassword]
        );

        console.log('Тестовые сотрудники успешно созданы!');

    } catch (error) {
        console.error('Ошибка создания сотрудников:', error);
    } finally {
        await db.end();
    }
}

createEmployees();
