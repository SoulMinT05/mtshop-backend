import jwt from 'jsonwebtoken';
import UserModel from '../models/UserModel.js';

export const generateAccessToken = async (userId, role) => {
    const token = jwt.sign({ _id: userId, role }, process.env.SECRET_KEY_ACCESS_TOKEN, { expiresIn: '30m' });
    return token;
};

export const generateRefreshToken = async (userId) => {
    const token = jwt.sign({ _id: userId }, process.env.SECRET_KEY_REFRESH_TOKEN, { expiresIn: '7d' });

    await UserModel.updateOne(
        {
            _id: userId,
        },
        {
            refreshToken: token,
        }
    );
    return token;
};
