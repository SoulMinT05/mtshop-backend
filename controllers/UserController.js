import { v2 as cloudinary } from 'cloudinary';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import UserModel from '../models/UserModel.js';
import StaffModel from '../models/StaffModel.js';
import ProductModel from '../models/ProductModel.js';
import OrderModel from '../models/OrderModel.js';
import ReviewModel from '../models/ReviewModel.js';
import NotificationModel from '../models/NotificationModel.js';

import { verifyEmailHtml } from '../utils/emailHtmlUtils.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
import redisConfig from '../config/redisConfig.js';
import {
    emitDeleteReply,
    emitDeleteReview,
    emitNewReply,
    emitNewReview,
    emitNotificationStaffNewReview,
    emitReplyToReview,
    emitStaffNewReview,
    emitUserLogout,
} from '../config/socketConfig.js';
import { normalizeProductId, normalizeUserId } from '../utils/normalizeUtils.js';
import { sendAccountConfirmationEmail } from '../config/emailConfig.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true,
});

const register = async (req, res) => {
    try {
        let user;
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'Cần nhập đủ thông tin tên, email, password!',
                success: false,
            });
        }

        // Kiểm tra xem người dùng đã đăng ký chưa
        user = await UserModel.findOne({ email });
        if (user) {
            if (user.emailVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'Email này đã được đăng ký và xác minh! Bạn có thể đăng nhập',
                });
            }

            const isOtpExpired = user.otpExpires < Date.now();

            // OTP còn hạn
            if (!isOtpExpired) {
                return res.status(400).json({
                    success: false,
                    message: 'Bạn đã đăng ký, vui lòng xác minh email bằng OTP!',
                });
            }

            // OTP hết hạn → cho phép đăng ký lại từ đầu
            if (isOtpExpired) {
                const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpires = Date.now() + Number(process.env.OTP_EXPIRATION) * 60 * 1000; // 2 phút nữa hết hạn

                const salt = await bcryptjs.genSalt(10);
                const hashPassword = await bcryptjs.hash(password, salt);

                user.name = name;
                user.password = hashPassword;
                user.otp = verifyCode;
                user.otpExpires = otpExpires;

                // Lưu thông tin đã cập nhật vào cơ sở dữ liệu
                await user.save();

                const token = jwt.sign(
                    {
                        email: user.email,
                        id: user._id,
                    },
                    process.env.JSON_WEB_TOKEN_SECRET_KEY
                );

                return res.status(200).json({
                    success: true,
                    message: 'Đăng ký tài khoản thành công. Vui lòng kiểm tra email!',
                    token,
                });
            }
        }

        // Nếu người dùng chưa đăng ký, tiến hành đăng ký mới
        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

        const salt = await bcryptjs.genSalt(10);
        const hashPassword = await bcryptjs.hash(password, salt);

        const message = 'đăng ký tài khoản';
        // Gửi email xác minh
        await sendAccountConfirmationEmail(
            email,
            '[From RubyStore] Xác minh địa chỉ email',
            '',
            verifyEmailHtml(name, message, verifyCode)
        );

        // Lưu thông tin người dùng vào database
        user = new UserModel({
            name,
            email,
            password: hashPassword,
            otp: verifyCode,
            otpExpires: Date.now() + Number(process.env.OTP_EXPIRATION) * 60 * 1000, // 2 phút
        });
        await user.save();

        const token = jwt.sign(
            {
                email: user.email,
                id: user._id,
            },
            process.env.JSON_WEB_TOKEN_SECRET_KEY
        );

        return res.status(200).json({
            success: true,
            message: 'Đăng ký tài khoản thành công. Vui lòng kiểm tra email!',
            token,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { token, otp } = req.body;

        let decoded;
        decoded = jwt.verify(token, process.env.JSON_WEB_TOKEN_SECRET_KEY);
        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ hoặc đã hết hạn!',
            });
        }

        const email = decoded.email;

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy người dùng!',
            });
        }
        const isCodeValid = user.otp === otp;
        const isNotExpired = user.otpExpires > Date.now();

        if (isCodeValid && isNotExpired) {
            user.emailVerified = true;
            user.otp = null;
            user.otpExpires = null;
            await user.save();
            return res.status(200).json({
                success: true,
                message: 'Xác thực email thành công! Bạn đã có thể đăng nhập',
            });
        } else if (!isCodeValid) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP không hợp lệ! Vui lòng thử lại sau',
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP hết hạn! Vui lòng đăng ký lại',
            });
        }
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản chưa được đăng ký!',
            });
        }
        if (user.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản không hoạt động. Hãy liên hệ nhân viên / quản lý để được hỗ trợ!',
            });
        }
        if (!user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: 'Tài khoản chưa xác thực. Hãy xác thực tài khoản!',
            });
        }
        const checkPassword = await bcryptjs.compare(password, user.password);
        if (!checkPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu không đúng. Hãy kiểm tra lại!',
            });
        }

        const accessToken = await generateAccessToken(user._id, user.role);
        const refreshToken = await generateRefreshToken(user._id);

        await UserModel.findByIdAndUpdate(user?._id, {
            lastLoginDate: new Date(),
        });

        const cookiesOptionAccessToken = {
            secure: true, // Dùng HTTPS
            sameSite: 'Strict',
            maxAge: 10 * 60 * 1000, // 10 phút (đổi theo bạn config expiresIn bên JW
        };
        const cookiesOptionRefreshToken = {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
        };
        res.cookie('accessToken', accessToken, cookiesOptionAccessToken);
        res.cookie('refreshToken', refreshToken, cookiesOptionRefreshToken);

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        return res.status(500).json({
            er: 'Lỗi nè',
            message: error.message || error,
            success: false,
        });
    }
};

const authWithGoogle = async (req, res) => {
    const { name, email, avatar, phoneNumber, role } = req.body;

    try {
        let user = await UserModel.findOne({ email });

        if (!user) {
            // User mới
            console.log('User mới');
            user = await UserModel.create({
                name,
                phoneNumber,
                email,
                password: 'null', // không dùng password
                avatar,
                role: role || 'user',
                emailVerified: true,
                signUpWithGoogle: true,
            });
            await user.save();
        } else {
            // User đã tồn tại → cập nhật lastLoginDate & emailVerified
            console.log('User đã tồn tại');
            user.lastLoginDate = new Date();
            user.signUpWithGoogle = true;
            user.emailVerified = true;
            await user.save();
        }

        // Tạo JWT
        const accessToken = await generateAccessToken(user._id, user.role);
        const refreshToken = await generateRefreshToken(user._id);

        // Set cookie
        const cookiesOptionAccessToken = {
            secure: true,
            sameSite: 'Strict',
            maxAge: 10 * 60 * 1000, // 10 phút
        };
        const cookiesOptionRefreshToken = {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
        };
        res.cookie('accessToken', accessToken, cookiesOptionAccessToken);
        res.cookie('refreshToken', refreshToken, cookiesOptionRefreshToken);

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập bằng Google thành công',
            data: {
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đăng nhập thất bại',
        });
    }
};

const authWithFacebook = async (req, res) => {
    const { name, email, avatar, phoneNumber, role } = req.body;

    try {
        let user = await UserModel.findOne({ email });

        if (!user) {
            // User mới
            console.log('User mới');
            user = await UserModel.create({
                name,
                phoneNumber,
                email,
                password: 'null', // không dùng password
                avatar,
                role: role || 'user',
                emailVerified: true,
                signInWithFacebook: true,
            });
            await user.save();
        } else {
            // User đã tồn tại → cập nhật lastLoginDate & emailVerified
            console.log('User đã tồn tại');
            user.lastLoginDate = new Date();
            user.signInWithFacebook = true;
            user.emailVerified = true;
            await user.save();
        }

        // Tạo JWT
        const accessToken = await generateAccessToken(user._id, user.role);
        const refreshToken = await generateRefreshToken(user._id);

        // Set cookie
        const cookiesOptionAccessToken = {
            secure: true,
            sameSite: 'Strict',
            maxAge: 10 * 60 * 1000, // 10 phút
        };
        const cookiesOptionRefreshToken = {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
        };
        res.cookie('accessToken', accessToken, cookiesOptionAccessToken);
        res.cookie('refreshToken', refreshToken, cookiesOptionRefreshToken);

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập bằng Google thành công',
            data: {
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Đăng nhập thất bại',
        });
    }
};

const logout = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        const role = user.role;

        const cookie = req.cookies;
        if (!cookie || !cookie.refreshToken) throw new Error('Không tìm thấy refresh token trong cookies');

        const cookiesOption = {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
        };
        res.clearCookie('accessToken', cookiesOption);
        res.clearCookie('refreshToken', cookiesOption);

        await UserModel.findByIdAndUpdate(
            userId,
            {
                refreshToken: '',
            },
            { new: true }
        );

        // await emitUserLogout(userId, role);

        return res.status(200).json({
            success: true,
            message: 'Đăng xuất thành công',
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const uploadAvatar = async (req, res) => {
    try {
        const userId = req.user._id;
        const image = req.file;

        const user = await UserModel.findOne({ _id: userId });
        if (!user) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // first remove image from cloudinary
        if (user.avatar) {
            const urlArr = user.avatar.split('/');
            const publicIdWithExt = urlArr[urlArr.length - 1]; // vd: abc123.jpg
            const publicId = publicIdWithExt.split('.')[0]; // abc123
            await cloudinary.uploader.destroy(`rubystore/${publicId}`);
        }

        user.avatar = image.path;
        await user.save();

        return res.status(200).json({
            success: true,
            _id: userId,
            avatar: image.path,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const removeImageFromCloudinary = async (req, res) => {
    try {
        const imgUrl = req.query.img;
        const urlArr = imgUrl.split('/');
        const image = urlArr[urlArr.length - 1];
        const imageName = image.split('.')[0];

        if (imageName) {
            const result = await cloudinary.uploader.destroy(imageName);
            if (result) {
                return res.status(200).json({
                    success: true,
                    message: 'Xoá ảnh thành công',
                });
            }
        }
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const updateInfoUser = async (req, res) => {
    try {
        const { _id } = req.user;
        const { name, password, phoneNumber } = req.body;

        const userExist = await UserModel.findById(_id);
        if (!userExist) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy người dùng!',
            });
        }
        let hashPassword = '';
        if (password) {
            const salt = await bcryptjs.genSalt(10);
            hashPassword = await bcryptjs.hash(password, salt);
        } else {
            hashPassword = userExist.password;
        }

        const updateUser = await UserModel.findByIdAndUpdate(
            _id,
            {
                name,
                phoneNumber,
                password: hashPassword,
            },
            { new: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin thành công',
            user: updateUser,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ',
            });
        }
        let verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

        const updateUser = await UserModel.findByIdAndUpdate(
            user._id,
            {
                otp: verifyCode,
                otpExpires: Date.now() + 600000,
            },
            { new: true }
        );

        const message = 'xin cấp lại mật khẩu mới';
        await sendAccountConfirmationEmail(
            email,
            '[From RubyStore] Xác minh địa chỉ email',
            '',
            verifyEmailHtml(user?.name, message, verifyCode)
        );

        return res.status(200).json({
            success: true,
            message: 'Mã OTP đã được gửi. Kiểm tra email',
            user: updateUser,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};
const verifyForgotPasswordOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ',
            });
        }

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Điền đầy đủ thông tin email, otp',
            });
        }

        if (otp !== user.otp) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP không hợp lệ! Kiểm tra lại',
            });
        }

        const currentTime = new Date().toISOString();
        if (user.otpExpires < currentTime) {
            return res.status(400).json({
                success: false,
                message: 'Mã OTP đã hết hạn',
            });
        }
        user.otp = '';
        user.otpExpires = '';
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Xác minh OTP thành công',
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};
const resetPassword = async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;
        if (!email || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Điền đầy đủ email, mật khẩu mới, xác nhận mật khẩu',
            });
        }
        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ',
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu và xác nhận mật khẩu cần giống nhau!',
            });
        }
        const salt = await bcryptjs.genSalt(10);
        const hashPassword = await bcryptjs.hash(password, salt);

        await UserModel.findOneAndUpdate(user._id, {
            password: hashPassword,
        });

        return res.status(200).json({
            success: true,
            message: 'Đặt lại mật khẩu thành công. Bạn đã có thể đăng nhập!',
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const changePassword = async (req, res) => {
    try {
        const { email, oldPassword, password, confirmPassword } = req.body;

        if (!email || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ mật khẩu mới, xác nhận mật khẩu.',
            });
        }

        const user = await UserModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không tồn tại.',
            });
        }

        if (!user?.signUpWithGoogle && !user?.signInWithFacebook) {
            const isMatch = await bcryptjs.compare(oldPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu cũ không đúng.',
                });
            }
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu mới và xác nhận mật khẩu không khớp.',
            });
        }

        const salt = await bcryptjs.genSalt(10);
        const hashPassword = await bcryptjs.hash(password, salt);

        await UserModel.findByIdAndUpdate(user._id, {
            password: hashPassword,
            signUpWithGoogle: false,
            signInWithFacebook: false,
        });

        return res.status(200).json({
            success: true,
            message: 'Đổi mật khẩu thành công!',
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const getUserDetails = async (req, res) => {
    try {
        const { _id } = req.user;

        const user = await UserModel.findById(_id).select('-password -refreshToken');
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Thông tin người dùng',
            user,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const refreshToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken || req?.headers?.authorization?.split(' ')[1];
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Token không hợp lệ',
            });
        }

        const verifyToken = jwt.verify(refreshToken, process.env.SECRET_KEY_REFRESH_TOKEN);
        if (!verifyToken) {
            return res.status(401).json({
                success: false,
                message: 'Token đã hết hạn',
            });
        }
        const userId = verifyToken?._id;
        // ✅ Lấy role từ DB
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        const newAccessToken = await generateAccessToken(userId, user.role);

        const cookiesOption = {
            secure: true,
            sameSite: 'Strict',
        };
        res.cookie('accessToken', newAccessToken, cookiesOption);
        return res.status(200).json({
            success: true,
            message: 'Access token mới đã được tạo',
            data: {
                accessToken: newAccessToken,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const checkLogin = async (req, res) => {
    const accessToken = req.cookies.accessToken; // Lấy token từ cookie
    if (!accessToken) {
        return res.status(401).json({
            success: false,
            message: 'Người dùng chưa đăng nhập',
        });
    }
    try {
        jwt.verify(accessToken, process.env.SECRET_KEY_ACCESS_TOKEN);
        return res.status(200).json({
            success: true,
            message: 'Người dùng đã đăng nhập',
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token không hợp lệ',
        });
    }
};

const checkIsRefreshToken = async (req, res) => {
    const refreshToken = req.cookies.refreshToken; // Lấy token từ cookie
    if (!refreshToken) {
        return res.status(401).json({
            success: false,
            message: 'Chưa có refreshToken trong cookies',
        });
    }
    try {
        // Xác thực token
        jwt.verify(refreshToken, process.env.SECRET_KEY_REFRESH_TOKEN);
        return res.status(200).json({
            success: true,
            message: 'Đã có refreshToken trong cookies',
        });
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Refresh token không hợp lệ',
        });
    }
};

// CART
const getCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await UserModel.findById(userId).select('shoppingCart').populate({
            path: 'shoppingCart.product',
        });
        // Nếu không có giỏ hàng, trả mặc định rỗng
        const cartItems = user?.shoppingCart || [];

        // Tính tổng
        let totalQuantity = 0;
        let totalPrice = 0;

        cartItems.forEach((item) => {
            const quantityProduct = item?.quantityProduct || 0;
            const price = item?.price || 0;

            totalQuantity += quantityProduct;
            totalPrice += price * quantityProduct;
        });

        return res.status(200).json({
            success: true,
            cart: {
                items: cartItems,
            },
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const updateCartItemSize = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, oldSize, newSize } = req.body;

        if (!productId || !oldSize || !newSize) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu productId, oldSize hoặc newSize',
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // Tìm item hiện tại cần đổi size (A)
        const currentIndex = user.shoppingCart.findIndex(
            (item) => item.product.toString() === productId && item.sizeProduct === oldSize
        );
        if (currentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm phù hợp để đổi size',
            });
        }

        const currentItem = user.shoppingCart[currentIndex];
        // Tìm item khác cùng productId + newSize (B nếu có)
        const newIndex = user.shoppingCart.findIndex(
            (item, idx) => item.product.toString() === productId && item.sizeProduct === newSize && idx !== currentIndex
        );
        if (newIndex !== -1) {
            // Nếu đã có size mới trong cart → cộng dồn quantity và xoá item cũ
            user.shoppingCart[newIndex].quantityProduct += currentItem.quantityProduct;
            user.shoppingCart.splice(currentIndex, 1);
        } else {
            // Nếu chưa có size mới → chỉ cập nhật size
            user.shoppingCart[currentIndex].sizeProduct = newSize;
        }

        await user.save();

        return res.status(200).json({
            success: true,
            shoppingCart: user.shoppingCart,
            message: 'Cập nhật size thành công',
        });
    } catch (error) {
        console.error('Lỗi updateCartItemSize:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};
const updateQuantityItemsCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, sizeProduct, quantityProduct } = req.body;

        if (!productId || !sizeProduct) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu productId hoặc size',
            });
        }

        const quantity = parseInt(quantityProduct, 10);

        if (isNaN(quantity)) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng không hợp lệ',
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // ✅ Lấy thông tin sản phẩm để kiểm tra tồn kho
        const query = normalizeProductId(productId);
        const product = await ProductModel.findOne(query).lean();
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        if (quantity > product.countInStock) {
            return res.status(400).json({
                success: false,
                message: `Chỉ còn ${product.countInStock} sản phẩm trong kho`,
            });
        }

        const cartItemIndex = user.shoppingCart.findIndex(
            (item) => item.product.toString() === productId && item.sizeProduct === sizeProduct
        );

        let message = '';

        if (cartItemIndex !== -1) {
            if (quantity <= 0) {
                // ❌ Số lượng <= 0 => xóa sản phẩm khỏi giỏ hàng
                user.shoppingCart.splice(cartItemIndex, 1);
                message = 'Xóa sản phẩm khỏi giỏ hàng do số lượng = 0';
            } else {
                user.shoppingCart[cartItemIndex].quantityProduct = quantity;
                message = 'Cập nhật số lượng sản phẩm trong giỏ hàng';
            }
        } else {
            if (quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Không thể thêm sản phẩm với số lượng <= 0',
                });
            }

            user.shoppingCart.push({
                product: product._id,
                name: product.name,
                brand: product.brand,
                price: product.price,
                oldPrice: product.oldPrice,
                images: product.images,
                sizeProduct,
                quantityProduct: quantity,
            });

            message = 'Thêm sản phẩm vào giỏ hàng thành công';
        }

        await user.save();

        return res.status(200).json({
            success: true,
            shoppingCart: user.shoppingCart,
            message,
        });
    } catch (error) {
        console.error('Lỗi updateQuantityItemsCart:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};

const addToCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, sizeProduct, quantityProduct } = req.body;

        if (!productId || !sizeProduct) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu productId hoặc size',
            });
        }
        const quantity = parseInt(quantityProduct, 10) || 1;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        const query = normalizeProductId(productId);
        const product = await ProductModel.findOne(query).lean();
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        const cartItemIndex = user.shoppingCart.findIndex(
            (item) => item.product.toString() === productId && item.sizeProduct === sizeProduct
        );

        // Tổng số lượng sau khi thêm
        const currentQty = cartItemIndex !== -1 ? user.shoppingCart[cartItemIndex].quantityProduct : 0;
        const totalAfterAdd = currentQty + quantity;

        if (totalAfterAdd > product.countInStock) {
            return res.status(400).json({
                success: false,
                message: `Chỉ còn ${product.countInStock} sản phẩm trong kho`,
            });
        }

        let message = '';
        if (cartItemIndex !== -1) {
            user.shoppingCart[cartItemIndex].quantityProduct = totalAfterAdd;
            message = 'Tăng số lượng sản phẩm cùng size trong giỏ hàng';
        } else {
            user.shoppingCart.push({
                product: product._id,
                name: product.name,
                brand: product.brand,
                price: product.price,
                oldPrice: product.oldPrice,
                images: product.images,
                sizeProduct,
                quantityProduct: quantity,
            });

            message = 'Thêm sản phẩm vào giỏ hàng thành công';
        }

        await user.save();

        return res.status(200).json({
            success: true,
            shoppingCart: user.shoppingCart,
            message,
        });
    } catch (error) {
        console.error('Lỗi addToCart:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};

const decreaseQuantityCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, sizeProduct } = req.body;
        if (!productId || !sizeProduct) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu productId hoặc sizeProduct',
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        const index = user.shoppingCart.findIndex(
            (item) => item.product.toString() === productId && item.sizeProduct === sizeProduct
        );
        if (index === -1) {
            return res.status(404).json({
                success: false,
                message: 'Sản phẩm không tồn tại trong giỏ hàng',
            });
        }

        if (user.shoppingCart[index].quantityProduct > 1) {
            user.shoppingCart[index].quantityProduct -= 1;
        } else {
            // Nếu quantity = 1 => xóa khỏi giỏ
            user.shoppingCart.splice(index, 1);
        }

        await user.save();

        return res.status(200).json({
            success: true,
            shoppingCart: user.shoppingCart,
            message: 'Giảm số lượng sản phẩm giỏ hàng',
        });
    } catch (error) {
        console.error('Lỗi decreaseQuantityCart:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};

const removeProductCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { cartId } = req.body;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        user.shoppingCart = user.shoppingCart.filter((item) => item._id.toString() !== cartId);
        await user.save();
        return res.status(200).json({
            success: true,
            message: 'Xoá sản phẩm khỏi giỏ hàng',
            cart: user.shoppingCart,
        });
    } catch (error) {
        console.error('Lỗi khi xoá sản phẩm khỏi giỏ hàng:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};

const deleteMultipleCartItems = async (req, res) => {
    try {
        const userId = req.user._id;
        const { cartIds } = req.body;

        if (!Array.isArray(cartIds) || cartIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách cartId không hợp lệ',
            });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // Lọc bỏ các sản phẩm có _id nằm trong cartIds
        user.shoppingCart = user.shoppingCart.filter((item) => !cartIds.includes(item._id.toString()));

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Đã xoá các sản phẩm khỏi giỏ hàng',
            cart: user.shoppingCart,
        });
    } catch (error) {
        console.error('Lỗi khi xoá nhiều item:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};

// WISHLIST
const addToWishlist = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu ID sản phẩm!',
            });
        }

        const user = await UserModel.findById(userId);

        const alreadyExists = user.wishlist.some((item) => item.product.toString() === productId);
        if (alreadyExists) {
            return res.status(400).json({
                success: false,
                message: 'Sản phẩm đã có trong wishlist!',
            });
        }

        const query = normalizeProductId(productId);
        const product = await ProductModel.findOne(query);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Sản phẩm không tồn tại!',
            });
        }

        const wishlistItem = {
            product: product._id,
            productName: product.name,
            images: product.images,
            price: product.price,
            oldPrice: product.oldPrice,
            brand: product.brand,
        };

        user.wishlist.push(wishlistItem);
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Yêu thích thành công!',
            wishlist: wishlistItem,
        });
    } catch (error) {
        console.error('Add to wishlist error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ!',
        });
    }
};

const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.params;

        const user = await UserModel.findById(userId);

        // Tìm item cần xoá
        const removedItem = user.wishlist.find((item) => {
            const itemProductId = item.product.toString();
            console.log({ itemProductId, productId });
            return item.product.toString() === productId;
        });
        if (!removedItem) {
            return res.status(404).json({
                success: false,
                message: 'Sản phẩm không có trong wishlist!',
            });
        }
        await UserModel.findByIdAndUpdate(userId, { $pull: { wishlist: { product: productId } } }, { new: true });

        return res.status(200).json({
            success: true,
            message: 'Hủy yêu thích sản phẩm',
            removedItem,
            wishlistId: removedItem._id,
        });
    } catch (error) {
        console.error('Remove wishlist error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ!',
        });
    }
};

const getAllWishlists = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await UserModel.findById(userId).populate('wishlist.product', 'name slug');

        return res.status(200).json({
            success: true,
            wishlists: user.wishlist || [],
        });
    } catch (error) {
        console.error('Get wishlist error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ!',
        });
    }
};

const updateAddress = async (req, res) => {
    try {
        const userId = req.user._id; // userId lấy từ token sau khi verify
        const { streetLine, city, district, ward, country } = req.body;

        // Kiểm tra người dùng có tồn tại không
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Người dùng không tồn tại' });
        }

        // Update address
        user.address = {
            streetLine: streetLine || user.address?.streetLine || '',
            city: city || user.address?.city || '',
            district: district || user.address?.district || '',
            ward: ward || user.address?.ward || '',
            country: country || user.address?.country || 'Việt Nam',
        };

        await user.save();

        res.status(200).json({ success: true, message: 'Cập nhật địa chỉ thành công', address: user.address });
    } catch (error) {
        console.error('Lỗi khi cập nhật địa chỉ:', error);
        res.status(500).json({ success: false, message: 'Đã xảy ra lỗi khi cập nhật địa chỉ', error });
    }
};

// REVIEWS
const addReview = async (req, res) => {
    try {
        const { comment, rating, productId, sizeProduct } = req.body;
        const userId = req.user._id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        const query = normalizeProductId(productId);

        // 1. Tìm đơn hàng đã giao có chứa sản phẩm và chưa được review
        const order = await OrderModel.findOne({
            userId,
            orderStatus: 'delivered',
            selectedCartItems: {
                // tìm ít nhất một phần tử trong một mảng thỏa tất cả điều kiện con cùng lúc
                $elemMatch: {
                    product: productId,
                    sizeProduct,
                    isReviewed: false,
                },
            },
        });

        if (!order) {
            return res.status(400).json({
                success: false,
                message: 'Bạn chỉ có thể đánh giá sản phẩm sau khi đơn hàng được giao và chưa đánh giá.',
            });
        }

        // Map rating -> title
        let title = '';
        switch (Number(rating)) {
            case 5:
                title = 'Cực kỳ hài lòng';
                break;
            case 4:
                title = 'Hài lòng';
                break;
            case 3:
                title = 'Bình thường';
                break;
            case 2:
                title = 'Không hài lòng';
                break;
            case 1:
                title = 'Rất tệ';
                break;
            default:
                title = 'Chưa rõ';
                break;
        }

        // 2. Tạo đánh giá mới
        const newReview = new ReviewModel({
            userId,
            productId,
            comment,
            rating,
            title,
        });
        await newReview.save();
        await newReview.populate('userId', 'name email avatar createdAt');

        const populatedNewReview = await ReviewModel.findById(newReview._id)
            .populate('userId', 'name email avatar')
            .populate('replies.userId', 'name avatar')
            .populate('productId', 'name images');

        // 3. Gắn review vào sản phẩm
        await ProductModel.findOneAndUpdate(query, {
            $push: { review: newReview._id },
        });

        // 4. Tính lại điểm trung bình
        const reviews = await ReviewModel.find({ productId });
        const totalRating = reviews.reduce((acc, review) => acc + Number(review.rating), 0);
        const averageRating = (totalRating / reviews.length).toFixed(1);

        await ProductModel.findOneAndUpdate(query, {
            averageRating,
            reviewCount: reviews.length,
        });

        // 5. Đánh dấu đã review trong order
        await OrderModel.updateOne(
            {
                _id: order._id,
                'selectedCartItems.product': productId,
                'selectedCartItems.sizeProduct': sizeProduct,
            },
            {
                $set: { 'selectedCartItems.$.isReviewed': true },
            }
        );
        // New review for user
        emitNewReview(newReview);

        // Notification cho Staff, Admin
        const staffList = await StaffModel.find();
        for (const staff of staffList) {
            const notification = await NotificationModel.create({
                userId: staff._id,
                avatarSender: user.avatar,
                title: 'Có đánh giá mới',
                description: `Người dùng ${user.name} vừa đánh giá sản phẩm có ID #${productId}`,
                type: 'review',
                isRead: false,
                targetUrl: `/reviews`,
                bgColor: 'bg-blue-500',
            });
            emitNotificationStaffNewReview(staff._id, notification);
            emitStaffNewReview(staff._id, populatedNewReview);
        }

        return res.status(200).json({
            success: true,
            message: 'Đánh giá thành công',
            newReview,
            populatedNewReview,
            averageRating,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Lỗi server: ' + error.message,
        });
    }
};
const addReplyToReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { replyText } = req.body;
        const userId = req.user._id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người gửi',
            });
        }

        const review = await ReviewModel.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review không tồn tại' });
        }

        review.replies.push({
            userId,
            replyText,
        });

        await review.save();

        // Populate userId trong replies
        const populatedReview = await ReviewModel.findById(reviewId).populate('replies.userId', 'name avatar');

        // Lấy reply mới nhất
        const newReply = populatedReview.replies[populatedReview.replies.length - 1];

        // ✅ Emit cập nhật reply cho người dùng thấy
        emitNewReply({
            reviewId,
            newReply,
        });

        const receiverUserId = review.userId;
        const sender = await UserModel.findById(userId).select('name avatar');

        const newReplyNotification = await NotificationModel.create({
            userId: receiverUserId,
            avatarSender: sender.avatar,
            title: `${sender.name} đã phản hồi đánh giá của bạn.`,
            description: newReply.replyText,
            type: 'reply',
            isRead: false,
            bgColor: 'bg-red-500', // Màu cho trạng thái cập nhật
            targetUrl: `/product/${review.productId}?tab=review`,
        });

        // ✅ Emit thông báo socket tới riêng người dùng
        emitReplyToReview(receiverUserId, newReplyNotification);

        res.status(200).json({
            success: true,
            message: 'Phản hồi thành công',
            review,
            reviewId,
            newReply,
            newReplyNotification,
        });
    } catch (err) {
        console.error('addReplyToReview error:', err);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};
const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const userId = req.user._id; // user đang đăng nhập

        const review = await ReviewModel.findById(reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đánh giá',
            });
        }

        // ✅ Chỉ cho phép xóa nếu là người viết review
        if (review.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Bạn không có quyền xóa đánh giá này',
            });
        }

        await ReviewModel.findByIdAndDelete(reviewId);

        emitDeleteReview(reviewId);

        return res.status(200).json({
            success: true,
            message: 'Xóa đánh giá thành công',
            reviewId,
        });
    } catch (error) {
        console.error('deleteReview error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi máy chủ',
        });
    }
};
const deleteReplyFromReview = async (req, res) => {
    try {
        const { reviewId, replyId } = req.params;
        const userId = req.user._id;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        const review = await ReviewModel.findById(reviewId);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
        }

        review.replies = review.replies.filter((r) => r._id.toString() !== replyId);
        await review.save();

        emitDeleteReply({ reviewId, replyId });

        return res.status(200).json({ success: true, message: 'Xóa phản hồi thành công' });
    } catch (error) {
        console.error('deleteReplyFromReview error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

const getDetailsReview = async (req, res) => {
    try {
        const { productId } = req.params;
        if (!productId) {
            return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' });
        }

        // const reviews = await ReviewModel.find({ productId }).populate('userId', '-refreshToken -password'); // Lấy thông tin user
        const query = normalizeProductId(productId);
        const product = await ProductModel.findOne(query).populate({
            path: 'review',
            populate: [
                {
                    path: 'userId',
                    select: 'name avatar email createdAt',
                },
                {
                    path: 'replies.userId', // ✅ thêm dòng này để populate người reply
                    select: 'name avatar email createdAt',
                },
            ],
        });
        res.status(200).json({ success: true, product });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

const getReviewsBySlugProduct = async (req, res) => {
    try {
        const { slug } = req.params;
        if (!slug) {
            return res.status(400).json({ message: 'ID sản phẩm không hợp lệ.' });
        }

        // 🔹 Cắt productId từ slug
        const match = slug.match(/-p([a-zA-Z0-9]+)$/);
        if (!match) {
            return res.status(400).json({ message: 'Slug sản phẩm không đúng định dạng.' });
        }

        const rawId = match[1];
        const isObjectId = mongoose.Types.ObjectId.isValid(rawId);
        console.log({ rawId, isObjectId });

        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || process.env.LIMIT_DEFAULT;
        const skip = (page - 1) * perPage;

        let query = {};
        if (isObjectId) {
            query.productId = new mongoose.Types.ObjectId(rawId);
        } else {
            query.productIdCrawl = rawId;
        }

        console.log(1);

        const [reviews, totalReviews] = await Promise.all([
            ReviewModel.find(query)
                .populate([
                    {
                        path: 'userId',
                        select: 'name avatar email createdAt',
                    },
                    {
                        path: 'replies.userId',
                        select: 'name avatar email createdAt',
                    },
                ])
                .skip(skip)
                .limit(perPage)
                .sort({ createdAt: -1 }), // mới nhất trước
            ReviewModel.countDocuments(query),
        ]);
        res.status(200).json({
            success: true,
            // productId,
            query,
            reviews,
            totalPages: Math.ceil(totalReviews / perPage),
            totalReviews,
            page,
            perPage,
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

const getReviews = async (req, res) => {
    try {
        const reviews = await ReviewModel.find()
            .populate('userId', 'name email avatar createdAt')
            .populate('replies.userId', 'name avatar'); // Lấy thông tin user
        res.status(200).json({ success: true, reviews });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

// USERS
const getUsersFromAdmin = async (req, res) => {
    try {
        let { field, value } = req.query;
        const filter = {};

        if (field && value) {
            if (typeof value === 'string') {
                value = value.trim();
            }

            if (field === 'createdAt') {
                // lọc theo ngày tạo
                const date = new Date(value);
                if (!isNaN(date)) {
                    const nextDay = new Date(date);
                    nextDay.setDate(date.getDate() + 1);
                    filter[field] = { $gte: date, $lt: nextDay };
                } else {
                    return res.status(400).json({ message: 'Giá trị ngày không hợp lệ' });
                }
            } else if (field === 'isLocked' || field === 'isOnline' || field === 'status' || field === 'role') {
                // lọc chính xác theo boolean/string
                filter[field] = value;
            } else if (field.startsWith('address.')) {
                // tìm trong address.* => regex
                filter[field] = { $regex: value, $options: 'i' };
            } else {
                // name, email, phoneNumber,... => regex
                filter[field] = { $regex: value, $options: 'i' };
            }
        }

        // phân trang
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || process.env.LIMIT_DEFAULT;
        const skip = (page - 1) * perPage;

        const [users, totalUsers] = await Promise.all([
            UserModel.find(filter)
                .select(
                    'name avatar address phoneNumber email createdAt updatedAt isLocked isOnline lastOnline lastLoginDate role status'
                )
                .skip(skip)
                .limit(perPage),
            UserModel.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            users,
            totalPages: Math.ceil(totalUsers / perPage),
            totalUsers,
            page,
            perPage,
        });
    } catch (error) {
        console.error('getUsersFromAdmin error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

const deleteUserFromAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await UserModel.findByIdAndDelete(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        res.status(200).json({ success: true, message: 'Xóa người dùng thành công', user });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

const deleteMultipleUsersFromAdmin = async (req, res) => {
    try {
        const { userIds } = req.body;
        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách người dùng không hợp lệ',
            });
        }

        const result = await UserModel.deleteMany({ _id: { $in: userIds } });
        return res.status(200).json({
            success: true,
            message: `Đã xóa ${result.deletedCount} người dùng`,
            userIds,
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

const deleteReviewFromAdmin = async (req, res) => {
    try {
        const { reviewId } = req.params;

        const review = await ReviewModel.findByIdAndDelete(reviewId);
        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy đánh giá',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Xóa đánh giá thành công',
            review,
        });
    } catch (error) {
        console.error('Lỗi khi xóa review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi xóa đánh giá.' });
    }
};

const deleteMultipleReviewsFromAdmin = async (req, res) => {
    try {
        const { reviewIds } = req.body;
        if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách đánh giá không hợp lệ',
            });
        }

        const result = await ReviewModel.deleteMany({ _id: { $in: reviewIds } });

        return res.status(200).json({
            success: true,
            message: `Đã xóa ${result.deletedCount} đánh giá`,
            reviewIds,
        });
    } catch (error) {
        console.error('Lỗi khi xóa nhiều review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi xóa đánh giá.' });
    }
};

const getUserDetailsFromAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await UserModel.findById(userId).select('-password -refreshToken');
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Thông tin người dùng',
            user,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const toggleUserLockStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const query = normalizeUserId(userId);

        const user = await UserModel.findOne(query);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // Toggle trạng thái isLocked
        user.isLocked = !user.isLocked;
        await user.save();

        return res.status(200).json({
            success: true,
            message: `Tài khoản đã được ${user.isLocked ? 'khóa' : 'mở khóa'}`,
            isLocked: user.isLocked,
        });
    } catch (error) {
        console.error('Lỗi khi đổi trạng thái khóa người dùng:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đổi trạng thái khóa người dùng.',
        });
    }
};
const updateUserInfoFromAdmin = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, phoneNumber, streetLine, ward, district, city } = req.body;

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // ✅ Cập nhật avatar nếu có file mới
        if (req.file) {
            // Nếu đã có avatar trước đó → xoá ảnh cũ khỏi Cloudinary
            if (user.avatar) {
                const urlArr = user.avatar.split('/');
                const publicIdWithExt = urlArr[urlArr.length - 1]; // abc123.jpg
                const publicId = publicIdWithExt.split('.')[0]; // abc123
                await cloudinary.uploader.destroy(`rubystore/${publicId}`);
            }

            // Upload ảnh mới
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'rubystore',
            });
            user.avatar = result.secure_url;
        }

        // ✅ Cập nhật thông tin
        if (name) user.name = name;
        if (phoneNumber !== undefined) {
            user.phoneNumber = phoneNumber;
        }

        user.address = {
            streetLine: streetLine || user.address?.streetLine || '',
            ward: ward || user.address?.ward || '',
            district: district || user.address?.district || '',
            city: city || user.address?.city || '',
        };

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin người dùng thành công',
            user,
            userId,
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật thông tin người dùng:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi cập nhật thông tin người dùng.',
        });
    }
};

const addUserFromAdmin = async (req, res) => {
    try {
        const { name, email, phoneNumber, password, streetLine, ward, district, city } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập đầy đủ tên, email và mật khẩu',
            });
        }

        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email đã được sử dụng',
            });
        }

        const lastPassword = password || 'Xinchaorubystore_123';
        const hashedPassword = await bcryptjs.hash(lastPassword, 10);

        let avatarUrl = '';
        if (req.file) {
            // Upload ảnh lên Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'rubystore',
            });
            avatarUrl = result.secure_url;
        }

        const newUser = await UserModel.create({
            name,
            email,
            password: hashedPassword,
            phoneNumber,
            avatar: avatarUrl,
            address: {
                streetLine,
                ward,
                district,
                city,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Thêm người dùng thành công',
            user: newUser,
        });
    } catch (error) {
        console.error('Lỗi khi tạo người dùng:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi tạo người dùng',
        });
    }
};

const searchUsersFromAdmin = async (req, res) => {
    try {
        const { field, value } = req.query;
        console.log('field, value: ', field, value);
        if (!field || !value) {
            return res.status(400).json({ message: 'Cần chọn loại và nhập giá trị tìm kiếm' });
        }

        let query = {};

        // Nếu search theo ngày tạo thì parse sang Date
        if (field === 'createdAt') {
            const date = new Date(value);
            if (!isNaN(date)) {
                // tìm trong ngày đó
                const nextDay = new Date(date);
                nextDay.setDate(date.getDate() + 1);
                query[field] = { $gte: date, $lt: nextDay };
            } else {
                return res.status(400).json({ message: 'Giá trị ngày không hợp lệ' });
            }
        } else {
            // search các field text => regex (không phân biệt hoa thường)
            query[field] = { $regex: value, $options: 'i' };
        }

        console.log('query: ', query);

        const searchUsers = await UserModel.find(query).select(
            'name avatar address phoneNumber email createdAt updatedAt isLocked isOnline lastOnline lastLoginDate role status'
        );
        return res.status(200).json({
            success: true,
            searchUsers,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

export {
    register,
    verifyEmail,
    login,
    authWithGoogle,
    authWithFacebook,
    logout,
    uploadAvatar,
    removeImageFromCloudinary,
    updateInfoUser,
    forgotPassword,
    verifyForgotPasswordOtp,
    resetPassword,
    changePassword,
    refreshToken,
    getUserDetails,
    checkLogin,
    checkIsRefreshToken,
    // cart
    updateCartItemSize,
    updateQuantityItemsCart,
    addToCart,
    decreaseQuantityCart,
    removeProductCart,
    deleteMultipleCartItems,
    getCart,
    // wishlist
    addToWishlist,
    removeFromWishlist,
    getAllWishlists,
    // address
    updateAddress,
    // review
    addReview,
    addReplyToReview,
    deleteReview,
    deleteReplyFromReview,
    getDetailsReview,
    getReviewsBySlugProduct,
    getReviews,
    // FOR ADMIN
    getUsersFromAdmin,
    deleteUserFromAdmin,
    deleteMultipleUsersFromAdmin,
    deleteReviewFromAdmin,
    deleteMultipleReviewsFromAdmin,
    getUserDetailsFromAdmin,
    toggleUserLockStatus,
    updateUserInfoFromAdmin,
    addUserFromAdmin,
    searchUsersFromAdmin,
};
