import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

import StaffModel from '../models/StaffModel.js';
import { verifyEmailHtml } from '../utils/emailHtmlUtils.js';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils.js';
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
        user = await StaffModel.findOne({ email });
        if (user) {
            const isOtpExpired = user.otpExpires < Date.now();
            if (isOtpExpired) {
                const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
                const otpExpires = Date.now() + 600000; // 10 phút nữa hết hạn

                const salt = await bcryptjs.genSalt(10);
                const hashPassword = await bcryptjs.hash(password, salt);

                user.name = name;
                user.password = hashPassword;
                user.otp = verifyCode;
                user.otpExpires = otpExpires;
                user.role = 'staff';

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
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Email này đã được đăng ký! Vui lòng xác minh email trước khi đăng ký lại.',
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
        user = new StaffModel({
            name,
            email,
            password: hashPassword,
            otp: verifyCode,
            otpExpires: Date.now() + 600000, // 10 phút
            role: 'staff',
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

        const user = await StaffModel.findOne({ email });
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
                message: 'Mã OTP hết hạn! Vui lòng thử lại sau',
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
        const user = await StaffModel.findOne({ email });
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

        await StaffModel.findByIdAndUpdate(user?._id, {
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

        const { password: _, ...userWithoutPassword } = user._doc;

        return res.status(200).json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                accessToken,
                refreshToken,
            },
            user: userWithoutPassword,
        });
    } catch (error) {
        return res.status(500).json({
            er: 'Lỗi nè',
            message: error.message || error,
            success: false,
        });
    }
};

const logout = async (req, res) => {
    try {
        const userId = req.user._id;

        const cookie = req.cookies;
        if (!cookie || !cookie.refreshToken) throw new Error('Không tìm thấy refresh token trong cookies');

        const cookiesOption = {
            httpOnly: true,
            secure: true,
            sameSite: 'Strict',
        };
        res.clearCookie('accessToken', cookiesOption);
        res.clearCookie('refreshToken', cookiesOption);

        await StaffModel.findByIdAndUpdate(
            userId,
            {
                refreshToken: '',
            },
            { new: true }
        );
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
        console.log('image ', image);

        const user = await StaffModel.findOne({ _id: userId });
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

        const userExist = await StaffModel.findById(_id);
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

        const updateUser = await StaffModel.findByIdAndUpdate(
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

        const user = await StaffModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không hợp lệ',
            });
        }
        let verifyCode = Math.floor(100000 + Math.random() * 900000).toString();

        const updateUser = await StaffModel.findByIdAndUpdate(
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
        const user = await StaffModel.findOne({ email });
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
        const user = await StaffModel.findOne({ email });
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

        await StaffModel.findOneAndUpdate(user._id, {
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

        if (!email || !oldPassword || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ mật khẩu cũ, mật khẩu mới, xác nhận mật khẩu.',
            });
        }

        const user = await StaffModel.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Email không tồn tại.',
            });
        }

        const isMatch = await bcryptjs.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu cũ không đúng.',
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu mới và xác nhận mật khẩu không khớp.',
            });
        }

        const salt = await bcryptjs.genSalt(10);
        const hashPassword = await bcryptjs.hash(password, salt);

        await StaffModel.findByIdAndUpdate(user._id, {
            password: hashPassword,
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
        const user = await StaffModel.findById(_id).select('-password -refreshToken');
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
        const user = await StaffModel.findById(userId);
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

const updateAddress = async (req, res) => {
    try {
        const userId = req.user._id; // userId lấy từ token sau khi verify
        const { streetLine, city, district, ward, country } = req.body;

        // Kiểm tra người dùng có tồn tại không
        const user = await StaffModel.findById(userId);
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

const addStaffFromAdmin = async (req, res) => {
    try {
        const { name, email, phoneNumber, password, streetLine, ward, district, city, role = 'staff' } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập đầy đủ tên, email và mật khẩu',
            });
        }

        const existingStaff = await StaffModel.findOne({ email });
        if (existingStaff) {
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

        const newStaff = await StaffModel.create({
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
            role,
        });

        res.status(201).json({
            success: true,
            message: 'Thêm nhân viên thành công',
            staff: newStaff,
        });
    } catch (error) {
        console.error('Lỗi khi tạo nhân viên:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi tạo nhân viên',
        });
    }
};

const updateStaffInfoFromAdmin = async (req, res) => {
    try {
        const { staffId } = req.params;
        const { name, phoneNumber, streetLine, ward, district, city } = req.body;

        const staff = await StaffModel.findById(staffId);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        // ✅ Không cho cập nhật admin khác
        if (staff.role !== 'staff' && req.user._id.toString() !== staffId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Không có quyền cập nhật thông tin nhân viên khác',
            });
        }

        // ✅ Cập nhật avatar nếu có file mới
        if (req.file) {
            // Nếu đã có avatar trước đó → xoá ảnh cũ khỏi Cloudinary
            if (staff.avatar) {
                const urlArr = staff.avatar.split('/');
                const publicIdWithExt = urlArr[urlArr.length - 1]; // abc123.jpg
                const publicId = publicIdWithExt.split('.')[0]; // abc123
                await cloudinary.uploader.destroy(`rubystore/${publicId}`);
            }

            // Upload ảnh mới
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'rubystore',
            });
            staff.avatar = result.secure_url;
        }

        // ✅ Cập nhật thông tin
        if (name) staff.name = name;
        if (phoneNumber) staff.phoneNumber = phoneNumber;
        staff.address = {
            streetLine: streetLine || staff.address?.streetLine || '',
            ward: ward || staff.address?.ward || '',
            district: district || staff.address?.district || '',
            city: city || staff.address?.city || '',
        };

        await staff.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin người dùng thành công',
            staff,
            staffId,
        });
    } catch (error) {
        console.error('Lỗi khi cập nhật thông tin người dùng:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi cập nhật thông tin người dùng.',
        });
    }
};

const toggleStaffLockStatusFromAdmin = async (req, res) => {
    try {
        const { staffId } = req.params;

        const staff = await StaffModel.findById(staffId);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        if (req.user._id.toString() === staffId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Không thể tự khóa chính mình',
            });
        }

        // ✅ Không cho cập nhật admin khác
        if (staff.role !== 'staff') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ được phép khóa nhân viên',
            });
        }

        // Toggle trạng thái isLocked
        staff.isLocked = !staff.isLocked;
        await staff.save();

        return res.status(200).json({
            success: true,
            message: `Tài khoản đã được ${staff.isLocked ? 'khóa' : 'mở khóa'}`,
            isLocked: staff.isLocked,
        });
    } catch (error) {
        console.error('Lỗi khi đổi trạng thái khóa người dùng:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đổi trạng thái khóa người dùng.',
        });
    }
};

const getStaffOrAdminDetails = async (req, res) => {
    try {
        const { staffId } = req.params;
        const staff = await StaffModel.findById(staffId).select('-password -refreshToken');
        if (!staff) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Thông tin người dùng',
            staff,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const deleteMultipleStaffsFromAdmin = async (req, res) => {
    try {
        const { staffIds } = req.body;
        if (!Array.isArray(staffIds) || staffIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách nhân viên không hợp lệ',
            });
        }

        const currentUserId = req.user._id.toString();
        const hasSelfDelete = staffIds.some((id) => id.toString() === currentUserId);
        if (hasSelfDelete) {
            return res.status(403).json({
                success: false,
                message: 'Không thể xóa chính tài khoản của bạn',
            });
        }

        const result = await StaffModel.deleteMany({
            _id: { $in: staffIds },
            role: 'staff',
        });
        return res.status(200).json({
            success: true,
            message: `Đã xóa ${result.deletedCount} nhân viên`,
            staffIds,
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

const deleteStaffFromAdmin = async (req, res) => {
    try {
        const { staffId } = req.params;
        const staff = await StaffModel.findById(staffId);
        if (!staff) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng',
            });
        }

        if (req.user._id.toString() === staffId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Không thể tự xóa chính mình',
            });
        }

        if (staff.role !== 'staff') {
            return res.status(403).json({
                success: false,
                message: 'Chỉ được phép xóa tài khoản nhân viên',
            });
        }

        await StaffModel.findByIdAndDelete(staffId);

        res.status(200).json({ success: true, message: 'Xóa người dùng thành công', staff });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách review:', error.message);
        res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
    }
};

// const getStaffsFromAdmin = async (req, res) => {
//     try {
//         let { field, value } = req.query;

//         let query = {};

//         // Nếu search theo ngày tạo thì parse sang Date
//         if (field && value) {
//             value = value.trim();
//             if (field === 'createdAt') {
//                 const date = new Date(value);
//                 if (!isNaN(date)) {
//                     // tìm trong ngày đó
//                     const nextDay = new Date(date);
//                     nextDay.setDate(date.getDate() + 1);
//                     query[field] = { $gte: date, $lt: nextDay };
//                 } else {
//                     return res.status(400).json({ message: 'Giá trị ngày không hợp lệ' });
//                 }
//             } else if (field.startsWith('address.')) {
//                 query[field] = { $regex: value, $options: 'i' };
//             } else {
//                 // search các field text => regex (không phân biệt hoa thường)
//                 query[field] = { $regex: value, $options: 'i' };
//             }
//         }

//         const staffs = await StaffModel.find(query).select(
//             'name avatar address phoneNumber email createdAt updatedAt isLocked isOnline lastOnline lastLoginDate role status'
//         );

//         res.status(200).json({ success: true, staffs });
//     } catch (error) {
//         console.error('Lỗi khi lấy danh sách review:', error.message);
//         res.status(500).json({ message: 'Lỗi server khi lấy đánh giá.' });
//     }
// };

const getStaffsFromAdmin = async (req, res) => {
    try {
        let { field, value } = req.query;
        const filter = {};

        console.log('field && value: ', field && value);

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

        const [staffs, totalStaffs] = await Promise.all([
            StaffModel.find(filter)
                .select(
                    'name avatar address phoneNumber email createdAt updatedAt isLocked isOnline lastOnline lastLoginDate role status'
                )
                .skip(skip)
                .limit(perPage),
            StaffModel.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            staffs,
            totalPages: Math.ceil(totalStaffs / perPage),
            totalStaffs,
            page,
            perPage,
        });
    } catch (error) {
        console.error('getUsersFromAdmin error:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
    }
};

export {
    register,
    verifyEmail,
    login,
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
    // address
    updateAddress,
    // FOR ADMIN
    addStaffFromAdmin,
    updateStaffInfoFromAdmin,
    toggleStaffLockStatusFromAdmin,
    getStaffOrAdminDetails,
    deleteMultipleStaffsFromAdmin,
    deleteStaffFromAdmin,
    getStaffsFromAdmin,
};
