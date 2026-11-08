import 'dotenv/config';
import { MongoClient, Db } from "mongodb";

const client = new MongoClient(process.env.DB_URL as string);

let db: Db;

export const connectDB = async() => {
    try{
        await client.connect();

        db = client.db();
        console.log("[Server]: Database connected!");
    }catch(error){
        console.error("[Error]: Failed connect to database!", error);
        process.exit(1);
    }
}

export const getDB = () => db;