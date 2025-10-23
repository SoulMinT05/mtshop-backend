import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// if (!process.env.MONGODB_URI) {
//     throw new Error('Bạn chưa có MONGODB_URL trong .env!');
// }
const mongoUri = process.env.NODE_ENV === 'production' ? process.env.MONGODB_URI_DOCKER : process.env.MONGODB_URI_LOCAL;
if (!mongoUri) {
    throw new Error('❌ Bạn chưa cấu hình MONGODB_URI_LOCAL hoặc MONGODB_URI_DOCKER trong .env!');
}

const dbConfig = async () => {
    try {
        await mongoose.connect(mongoUri);
        console.log('DB connect successfully');
    } catch (err) {
        console.log('DB connection is failed!!');
        throw new Error(err);
    }
};

export default dbConfig;
