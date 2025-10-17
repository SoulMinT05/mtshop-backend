import UserModel from '../models/UserModel.js';
import StaffModel from '../models/StaffModel.js';
import ProductModel from '../models/ProductModel.js';
import CategoryModel from '../models/CategoryModel.js';
import OrderModel from '../models/OrderModel.js';
import VoucherModel from '../models/VoucherModel.js';
import BlogModel from '../models/BlogModel.js';
import ReviewModel from '../models/ReviewModel.js';

import { getOnlineUsers } from '../config/socketConfig.js';
import { formatCurrency } from '../utils/formatUtils.js';

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true,
});
const getDashboardStatistics = async (req, res) => {
    try {
        const totalUsers = await UserModel.countDocuments();
        const totalStaffs = await StaffModel.countDocuments();
        const totalProducts = await ProductModel.countDocuments();
        const totalCategories = await CategoryModel.countDocuments();
        const totalOrders = await OrderModel.countDocuments();
        const totalBlogs = await BlogModel.countDocuments();
        const totalReviews = await ReviewModel.countDocuments();
        const totalVouchers = await VoucherModel.countDocuments();

        // Tổng doanh thu (đơn hàng đã thanh toán)
        const totalRevenueResult = await OrderModel.aggregate([
            {
                $match: {
                    $or: [{ paymentStatus: 'paid' }, { orderStatus: 'delivered' }],
                },
            },
            {
                $group: {
                    _id: null,
                    finalPrice: { $sum: '$finalPrice' },
                },
            },
        ]);
        const totalRevenue = totalRevenueResult[0]?.finalPrice || 0;
        const onlineUsers = getOnlineUsers();

        return res.status(200).json({
            success: true,
            statistics: {
                totalUsers,
                onlineUsers,
                totalStaffs,
                totalProducts,
                totalCategories,
                totalOrders,
                totalBlogs,
                totalReviews,
                totalVouchers,
                totalRevenue,
            },
        });
    } catch (error) {
        console.error('Lỗi dashboard:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thống kê',
        });
    }
};

// Users, staffs, admins
const getMonthlyStatisticsLineChartUserStaffAdmin = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();

        // Tổng người dùng theo tháng
        const users = await UserModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalUsers: { $sum: 1 },
                },
            },
        ]);

        // Tổng staff theo tháng (role: staff)
        const staffs = await StaffModel.aggregate([
            {
                $match: {
                    role: 'staff',
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalStaffs: { $sum: 1 },
                },
            },
        ]);

        // Tổng admin theo tháng (role: admin)
        const admins = await StaffModel.aggregate([
            {
                $match: {
                    role: 'admin',
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalAdmins: { $sum: 1 },
                },
            },
        ]);

        // Gộp data 12 tháng
        const stats = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const userData = users.find((u) => u._id === month);
            const staffData = staffs.find((s) => s._id === month);
            const adminData = admins.find((a) => a._id === month);

            return {
                name: `Tháng ${month}`,
                'Tổng người dùng': userData?.totalUsers || 0,
                'Tổng nhân viên': staffData?.totalStaffs || 0,
                'Tổng quản lý': adminData?.totalAdmins || 0,
            };
        });

        res.json({ success: true, lineChartData: stats });
    } catch (error) {
        console.error('getMonthlyStatisticsBarChart2 error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

// Order status
const getOrderStatusStatistics = async (req, res) => {
    try {
        const stats = await OrderModel.aggregate([
            {
                $group: {
                    _id: '$orderStatus',
                    count: { $sum: 1 },
                },
            },
        ]);

        // Format lại cho frontend
        const formattedStats = stats.map((s) => ({
            status: s._id,
            total: s.count,
        }));

        res.json({ success: true, orderData: formattedStats });
    } catch (error) {
        console.error('getOrderStatusStatistics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

// Users, Revenue from orders
const getMonthlyStatisticsBarChart2 = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();

        // Tổng người dùng theo tháng
        const users = await UserModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalUsers: { $sum: 1 },
                },
            },
        ]);

        // Tổng doanh thu theo tháng
        const orders = await OrderModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                    $or: [{ orderStatus: 'delivered' }, { paymentStatus: 'paid' }],
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalRevenue: { $sum: '$finalPrice' },
                },
            },
        ]);

        // Gộp data 12 tháng
        const stats = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const userData = users.find((u) => u._id === month);
            const orderData = orders.find((o) => o._id === month);

            return {
                name: `Tháng ${month}`,
                'Tổng người dùng': userData?.totalUsers || 0,
                'Tổng doanh thu': orderData?.totalRevenue || 0,
            };
        });

        res.json({ success: true, barChartData: stats });
    } catch (error) {
        console.error('getMonthlyStatistics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

// Revenue monthly
const getMonthlyRevenueStatistics = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();

        const orders = await OrderModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                    $or: [{ orderStatus: 'delivered' }, { paymentStatus: 'paid' }],
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalRevenue: { $sum: '$finalPrice' },
                },
            },
        ]);

        // Gộp data đủ 12 tháng
        const stats = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const orderData = orders.find((o) => o._id === month);

            return {
                name: `Tháng ${month}`,
                'Tổng doanh thu': orderData?.totalRevenue || 0,
            };
        });

        res.json({ success: true, revenueChartData: stats });
    } catch (error) {
        console.error('getMonthlyRevenueStatistics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

// Products, categories, orders, reviews
const getMonthlyStatisticsBarChartProductCategoryOrderReview = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();

        // Products theo tháng
        const products = await ProductModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalProducts: { $sum: 1 },
                },
            },
        ]);

        // Categories theo tháng
        const categories = await CategoryModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalCategories: { $sum: 1 },
                },
            },
        ]);

        // Orders theo tháng (chỉ lấy đơn đã giao hoặc đã thanh toán)
        const orders = await OrderModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                    $or: [{ orderStatus: 'delivered' }, { paymentStatus: 'paid' }],
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalOrders: { $sum: 1 },
                },
            },
        ]);

        // Reviews theo tháng
        const reviews = await ReviewModel.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(`${currentYear}-01-01`),
                        $lt: new Date(`${currentYear + 1}-01-01`),
                    },
                },
            },
            {
                $group: {
                    _id: { $month: '$createdAt' },
                    totalReviews: { $sum: 1 },
                },
            },
        ]);

        // Gộp data 12 tháng
        const stats = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const productData = products.find((p) => p._id === month);
            const categoryData = categories.find((c) => c._id === month);
            const orderData = orders.find((o) => o._id === month);
            const reviewData = reviews.find((r) => r._id === month);

            return {
                name: `Tháng ${month}`,
                'Tổng sản phẩm': productData?.totalProducts || 0,
                'Tổng danh mục': categoryData?.totalCategories || 0,
                'Tổng đơn hàng': orderData?.totalOrders || 0,
                'Tổng đánh giá': reviewData?.totalReviews || 0,
            };
        });

        res.json({ success: true, barChartData: stats });
    } catch (error) {
        console.error('getMonthlyStatistics error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

export {
    getDashboardStatistics,
    getMonthlyStatisticsLineChartUserStaffAdmin,
    getOrderStatusStatistics,
    getMonthlyRevenueStatistics,
    getMonthlyStatisticsBarChart2,
    getMonthlyStatisticsBarChartProductCategoryOrderReview,
};
