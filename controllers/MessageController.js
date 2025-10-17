import { v2 as cloudinary } from 'cloudinary';
import UserModel from '../models/UserModel.js';
import StaffModel from '../models/StaffModel.js';
import MessageModel from '../models/MessageModel.js';
import NotificationModel from '../models/NotificationModel.js';

import { populateUsersStaffsInMessages } from '../utils/populateUtils.js';
import { emitNotificationSendMessage, emitSendMessage } from '../config/socketConfig.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true,
});

export const sendMessage = async (req, res) => {
    try {
        const { text } = req.body;
        const { receiverId } = req.params;
        const senderId = req.user._id;

        const images = req.files;
        let imageUrls = [];
        if (images && images.length > 0) {
            imageUrls = await Promise.all(
                images?.map(async (img) => {
                    const uploadedImage = await cloudinary.uploader.upload(img.path); // upload ảnh lên Cloudinary (hoặc bất kỳ dịch vụ nào khác)
                    return uploadedImage.url; // trả về URL ảnh đã tải lên
                })
            );
        }

        const newMessage = new MessageModel({
            receiverId,
            senderId,
            text,
            images: imageUrls,
        });

        await newMessage.save();
        const populatedMessage = await populateUsersStaffsInMessages([newMessage]);
        emitSendMessage(receiverId, populatedMessage[0]);

        const newMessageNotification = await NotificationModel.create({
            userId: receiverId,
            avatarSender: populatedMessage[0].senderId.avatar,
            title: `${populatedMessage[0].senderId.name} đã nhắn tin cho bạn.`,
            description: text ? text : 'Hình ảnh',
            images: imageUrls ? imageUrls : [],
            type: 'message',
            isRead: false,
            bgColor: 'bg-blue-500', // Màu cho trạng thái cập nhật
            targetUrl: `/message/${senderId}`,
        });
        emitNotificationSendMessage(receiverId, newMessageNotification);

        return res.status(200).json({
            success: true,
            newMessage: populatedMessage[0],
            newMessageNotification,
        });
    } catch (error) {
        console.error('sendMessage error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getMessagesForUsers = async (req, res) => {
    try {
        const { staffId } = req.params;
        const myId = req.user._id;

        const messages = await MessageModel.find({
            $or: [
                { receiverId: staffId, senderId: myId },
                { receiverId: myId, senderId: staffId },
            ],
        });

        const populatedMessages = await populateUsersStaffsInMessages(messages);

        return res.status(200).json({
            success: true,
            messages: populatedMessages,
        });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getMessagesForStaffs = async (req, res) => {
    try {
        const { userId } = req.params;
        const myId = req.user._id;

        const messages = await MessageModel.find({
            $or: [
                { receiverId: userId, senderId: myId },
                { receiverId: myId, senderId: userId },
            ],
        });

        const populatedMessages = await populateUsersStaffsInMessages(messages);

        return res.status(200).json({
            success: true,
            messages: populatedMessages,
        });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getStaffsInSidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        // const staffs = await StaffModel.find().select('name email avatar status role isOnline lastOnline');
        const { search } = req.query;

        let query = {};
        if (search && search.trim() !== '') {
            query = {
                name: { $regex: search, $options: 'i' }, // tìm không phân biệt hoa thường
            };
        }

        const staffsQuery = StaffModel.find(query).select('name email avatar status role isOnline lastOnline');

        if (!search || search.trim() === '') {
            staffsQuery.limit(10);
        }

        const staffs = await staffsQuery;

        return res.status(200).json({
            success: true,
            staffs,
        });
    } catch (error) {
        console.error('getStaffsInSidebar error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getUsersInSidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await StaffModel.findById(userId).select('name email avatar status role isOnline lastOnline');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        // const users = await UserModel.find();
        const { search } = req.query;

        let query = {};
        if (search && search.trim() !== '') {
            query = {
                name: { $regex: search, $options: 'i' }, // tìm không phân biệt hoa thường
            };
        }

        const usersQuery = UserModel.find(query).select('name email avatar status role isOnline lastOnline');

        if (!search || search.trim() === '') {
            usersQuery.limit(10);
        }

        const users = await usersQuery;
        return res.status(200).json({
            success: true,
            users,
        });
    } catch (error) {
        console.error('getUsersInSidebar error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await UserModel.findById(userId).select('name email avatar status role isOnline lastOnline');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export const getStaffDetails = async (req, res) => {
    try {
        const { staffId } = req.params;

        const staff = await StaffModel.findById(staffId).select('name email avatar status role isOnline lastOnline');
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy nhân viên',
            });
        }

        return res.status(200).json({
            success: true,
            staff,
        });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};
