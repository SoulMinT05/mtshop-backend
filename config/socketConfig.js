import { Server } from 'socket.io';

import UserModel from '../models/UserModel.js';
import StaffModel from '../models/StaffModel.js';
import { printOnlineUsers } from '../utils/socketUtils.js';

let io = null;

const onlineUsers = new Map(); // Map(1) { 'user1' => Set(1) { 'socket1' } }
// '6807819d2352180e82e5ae6e': [ 'Z0X2Nu-eEzNJyik0AAAF' ]

const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ADMIN_URL,
    process.env.FRONTEND_URL_DOCKER,
    process.env.FRONTEND_ADMIN_URL_DOCKER,
    'http://localhost',
    'http://localhost:80',
];

const frontendUrl = process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL_DOCKER : process.env.FRONTEND_URL;
const frontendAdminUrl =
    process.env.NODE_ENV === 'production' ? process.env.FRONTEND_ADMIN_URL_DOCKER : process.env.FRONTEND_ADMIN_URL;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            // origin: [frontendUrl, frontendAdminUrl, 'localhost'],
            origin: allowedOrigins,
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        console.log('User connected có socket:', socket.id);

        socket.on('joinRoom', (userId, role) => {
            if (userId) {
                socket.join(userId.toString()); // Join vào room có tên là userId
                console.log(`Socket ${socket.id} có role: ${role} joined room with userId: ${userId}`);
            }
        });

        socket.on('joinMessageRoom', async (userId, role) => {
            if (!userId) return;

            socket.join(`message-${userId}`);
            console.log(`Socket ${socket.id} có role: ${role} joined message-${userId} room with userId: ${userId}`);

            socket.userId = userId;
            socket.role = role;

            // Lưu socketId cho user
            if (!onlineUsers.has(userId)) {
                onlineUsers.set(userId, new Set());
            }
            onlineUsers.get(userId).add(socket.id);

            printOnlineUsers(onlineUsers);

            // Cập nhật DB online (chỉ lần đầu tiên user connect)
            if (onlineUsers.get(userId).size === 1) {
                if (role === 'staff' || role === 'admin') {
                    await StaffModel.findByIdAndUpdate(userId, { isOnline: true }).exec();
                    io.emit('staffOnlineStatus', { userId, role, isOnline: true });
                } else if (role === 'user') {
                    await UserModel.findByIdAndUpdate(userId, { isOnline: true }).exec();
                    io.emit('userOnlineStatus', { userId, role, isOnline: true });
                }
            }
        });

        // socket.on('disconnect', () => {
        //     removeUserFromOnline(io, socket, onlineUsers);
        // });

        socket.on('disconnect', async () => {
            console.log('❌ User disconnected có socket:', socket.id);

            if (socket.userId) {
                const sockets = onlineUsers.get(socket.userId);
                console.log('sockets: ', sockets);

                if (sockets) {
                    sockets.delete(socket.id);

                    if (sockets.size === 0) {
                        // chỉ khi user không còn socket nào
                        onlineUsers.delete(socket.userId);

                        if (socket.role === 'staff' || socket.role === 'admin') {
                            await StaffModel.findByIdAndUpdate(socket.userId, {
                                isOnline: false,
                                lastOnline: new Date(),
                            }).exec();

                            io.emit('staffOnlineStatus', {
                                userId: socket.userId,
                                role: socket.role,
                                isOnline: false,
                                lastOnline: new Date(),
                            });
                        } else if (socket.role === 'user') {
                            await UserModel.findByIdAndUpdate(socket.userId, {
                                isOnline: false,
                                lastOnline: new Date(),
                            }).exec();

                            io.emit('userOnlineStatus', {
                                userId: socket.userId,
                                role: socket.role,
                                isOnline: false,
                                lastOnline: new Date(),
                            });
                        }
                    }
                }
            }

            printOnlineUsers(onlineUsers);
        });
    });
};

export const getOnlineUsers = () => {
    return onlineUsers.size;
};

// LOGOUT FOR USER --> REMOVE SOCKET
export const emitUserLogout1 = async (userId, role) => {
    if (!io) throw new Error('Socket.io not initialized');

    // Remove user khỏi onlineUsers
    const sockets = onlineUsers.get(userId);
    console.log('sockets: ', sockets);

    if (sockets) {
        sockets.forEach((socketId) => {
            const socket = io.sockets.sockets.get(socketId);
            console.log('socketId: ', socketId);
            if (socket) {
                socket.disconnect(true);
                console.log('Disconnect user khi logout!');
            }
        });
    }
};

export async function emitUserLogout(userId, role) {
    if (!io) throw new Error('Socket.io not initialized');

    console.log('🔌 User logout:', userId, role);

    const sockets = onlineUsers.get(userId);

    if (sockets && sockets.size > 0) {
        // sockets.forEach((socketId) => {
        //     const socket = io.sockets.sockets.get(socketId);
        //     if (socket) {
        //         socket.disconnect(true);
        //         console.log(`➡️ Disconnected socket ${socketId} for user ${userId}`);
        //     }
        // });

        // Sau khi disconnect hết socket => update DB và emit event
        onlineUsers.delete(userId);

        const updateData = {
            isOnline: false,
            lastOnline: new Date(),
        };

        if (role === 'staff' || role === 'admin') {
            await StaffModel.findByIdAndUpdate(userId, updateData).exec();
            io.emit('staffOnlineStatus', { ...updateData, userId, role });
        } else if (role === 'user') {
            await UserModel.findByIdAndUpdate(userId, updateData).exec();
            io.emit('userOnlineStatus', { ...updateData, userId, role });
        }
    }

    printOnlineUsers(onlineUsers);
}

// ORDER FOR USER
export const emitOrderStatusUpdated = (orderId, newStatus) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('updateOrderStatus', { orderId, newStatus });
};

export const emitNotificationOrder = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('notificationOrder', notification);
};

// ORDER FOR STAFF / ADMIN
// New order
export const emitNotificationStaffNewOrder = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('notificationStaffNewOrder', notification);
};
export const emitStaffNewOrder = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('staffNewOrder', notification);
};
// Cancel order
export const emitNotificationStaffCancelOrder = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('notificationStaffCancelOrder', notification);
};

export const emitNewReview = (reviewData) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('newReview', reviewData);
};

export const emitDeleteReview = (reviewData) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('deletedReview', reviewData);
};

export const emitDeleteReply = (replyData) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('deletedReply', replyData);
};

// REPLY FOR REVIEW
export const emitNewReply = (replyData) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('newReply', replyData);
};

export const emitReplyToReview = (receiverUserId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(receiverUserId.toString()).emit('notificationReplyToReview', notification);
};

// REVIEW FOR ADMIN
export const emitNotificationStaffNewReview = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('notificationStaffNewReview', notification);
};
export const emitStaffNewReview = (userId, review) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(userId.toString()).emit('staffNewReview', review);
};

// SEND MESSAGE
export const emitSendMessage = (receiverUserId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(`message-${receiverUserId.toString()}`).emit('newMessage', notification);
};
export const emitNotificationSendMessage = (userId, notification) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.to(`message-${userId.toString()}`).emit('notificationNewMessage', notification);
};

export const emitUpdateOrder = (orderData) => {
    if (!io) throw new Error('Socket.io not initialized');
    io.emit('updatedOrder', orderData);
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};
