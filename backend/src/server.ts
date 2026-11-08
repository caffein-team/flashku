import express, { Application, Request, Response } from "express";
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from "./config/db";

import AuthRouter from "./modules/auth.route";

dotenv.config();

const app: Application = express();

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    
    app.use('/api/auth', AuthRouter);

    app.get('/api/health', (req: Request, res: Response) => {
        return res.status(200).json({
            message: "Application running well"
        });
    });
    
    app.listen(PORT, () => {
        console.log(`[Server]: Application running on http://127.0.0.1:${PORT}`);
    });
});