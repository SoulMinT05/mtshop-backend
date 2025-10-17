import UserModel from '../models/UserModel.js';
import StaffModel from '../models/StaffModel.js';

export const populateUsersStaffsInMessages = async (messages) => {
    const senderIds = messages.map((m) => m.senderId);
    const receiverIds = messages.map((m) => m.receiverId);

    const allIds = [...new Set([...senderIds, ...receiverIds])];

    const users = await UserModel.find({ _id: { $in: allIds } }).select('name avatar role');
    const staffs = await StaffModel.find({ _id: { $in: allIds } }).select('name avatar role');

    // Gộp tất cả users/staffs lại
    const idToUserMap = {};
    [...users, ...staffs].forEach((u) => {
        idToUserMap[u._id.toString()] = u;
    });

    /*
        'aaaaa': {
            _id: new ObjectId('aaaaa'),
            name: 'Sun Sight',
            avatar: 'https://res.cloudinary.com/dd4zrjxvc/image/upload/v1751901361/rubystore/bomu30uagxgz7acxjz05.jpg',      
            role: 'user'
        },
        'bbb': {
            _id: new ObjectId('bbb'),
            name: 'Minh Hiếu ',
            avatar: 'https://res.cloudinary.com/dd4zrjxvc/image/upload/v1751963457/rubystore/e6gahcem4ky1qb58hdxj.jpg',      
            role: 'admin'
        }
    */

    // Gắn vào messages
    return messages.map((msg) => {
        // console.log('msg:', msg);
        return {
            ...msg.toObject(),
            senderId: idToUserMap[msg.senderId.toString()],
            receiverId: idToUserMap[msg.receiverId.toString()],
        };
    });
};
