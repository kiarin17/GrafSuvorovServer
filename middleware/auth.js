
const jwt = require('jsonwebtoken');

// Проверка токена авторизации
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: 'Необходимо авторизоваться'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                message: 'Токен не предоставлен'
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            message: 'Недействительный или просроченный токен'
        });
    }
}

// Проверка роли сотрудника
function checkRole(role) {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({
                message: 'Недостаточно прав для выполнения операции'
            });
        }

        next();
    };
}

module.exports = {
    authMiddleware,
    checkRole
};
