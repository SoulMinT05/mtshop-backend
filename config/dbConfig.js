import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.MONGODB_URI) {
    throw new Error('Bạn chưa có MONGODB_URL trong .env!');
}

const dbConfig = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('DB connect successfully');
    } catch (err) {
        console.log('DB connection is failed!!');
        throw new Error(err);
    }
};

export default dbConfig;
