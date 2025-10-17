// SOCKET IO
import http from 'http';
import { initSocket } from './config/socketConfig.js';

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import dbConfig from './config/dbConfig.js';
import route from './routes/index.js';

const app = express();
app.use(
    cors({
        origin: [process.env.FRONTEND_URL, process.env.FRONTEND_ADMIN_URL],
        credentials: true,
    })
);
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json({ type: 'application/*+json' }));
app.use(bodyParser.urlencoded({ extended: true }));

// app.use(morgan()); //Ghi log request đến server
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use(
    // Bảo vệ server khỏi các lỗ hổng bảo mật phổ biến
    helmet({
        crossOriginResourcePolicy: false,
    })
);

const server = http.createServer(app); // tạo HTTP server từ app
initSocket(server);

const port = process.env.PORT || 3001;

app.get('/', (req, res) => {
    res.json({
        message: 'Server is running ' + port,
    });
});

dbConfig().then(() => {
    server.listen(port, () => {
        console.log('Server is running in ' + port);
    });
});

route(app);
