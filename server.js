
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

require('dotenv').config();

const db = require('./config/db');

const app = express();


app.use(cors());
app.use(express.json());


const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Граф Суворов API',
            version: '1.0.0',
            description: 'API мобильного приложения кафе'
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Локальный сервер'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: ['./routes/*.js']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);


app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));


app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');

        res.json({
            message: 'Сервер работает',
            database: 'Подключение успешно'
        });

    } catch (error) {
        console.error('Ошибка подключения к БД:', error);

        res.status(500).json({
            message: 'Ошибка подключения к базе данных'
        });
    }
});


app.use('/api/tables', require('./routes/tables'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Swagger: http://localhost:${PORT}/api-docs`);
});
