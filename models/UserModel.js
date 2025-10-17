import mongoose from 'mongoose';

const userSchema = mongoose.Schema(
    {
        userId: {
            type: String, // userId cho crawl product data
            unique: true,
        },
        name: {
            type: String,
            required: [true, 'Provide name'],
        },
        email: {
            type: String,
            required: [true, 'Provide email'],
        },
        password: {
            type: String,
            // required: [true, 'Provide password'],
        },
        avatar: {
            type: String,
            default: '',
        },
        phoneNumber: {
            type: String,
            default: '',
        },
        emailVerified: {
            type: Boolean,
            default: false,
        },
        refreshToken: {
            type: String,
            default: '',
        },
        lastLoginDate: {
            type: Date,
            default: '',
        },
        isLocked: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ['active', 'unactive', 'suspended'],
            default: 'active',
        },
        address: {
            streetLine: { type: String, default: '' },
            city: { type: String, default: '' },
            district: { type: String, default: '' },
            ward: { type: String, default: '' },
            country: { type: String, default: 'Việt Nam' },
        },
        wishlist: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'product',
                },
                productName: {
                    type: String,
                    required: true,
                },
                images: [String],
                rating: Number,
                price: Number,
                oldPrice: Number,
                brand: String,
                discount: Number,
                addedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        // review: {
        //     type: mongoose.Schema.ObjectId,
        //     ref: 'review',
        // },
        shoppingCart: [
            {
                product: {
                    type: mongoose.Schema.ObjectId,
                    ref: 'product',
                },
                name: String,
                price: {
                    type: Number,
                },
                oldPrice: {
                    type: Number,
                },
                images: [
                    {
                        type: String,
                    },
                ],
                sizeProduct: String,
                quantityProduct: {
                    type: Number,
                    default: 1,
                },
            },
        ],
        checkoutToken: [
            {
                type: mongoose.Schema.ObjectId,
                ref: 'checkoutToken',
            },
        ],
        orderHistory: [
            {
                type: mongoose.Schema.ObjectId,
                ref: 'order',
            },
        ],
        notifications: [
            {
                type: mongoose.Schema.ObjectId,
                ref: 'notification',
            },
        ],
        searchHistory: [
            {
                type: String,
            },
        ],
        otp: {
            type: String,
        },
        otpExpires: {
            type: Date,
        },
        forgotPasswordOtp: {
            type: String,
            default: null,
        },
        forgotPasswordExpiry: {
            type: Date,
            default: '',
        },
        role: {
            type: String,
            enum: ['admin', 'staff', 'user'],
            default: 'user',
        },
        signUpWithGoogle: {
            type: Boolean,
            default: false,
        },
        signInWithFacebook: {
            type: Boolean,
            default: false,
        },
        isOnline: { type: Boolean, default: false },
        lastOnline: { type: Date, default: null },
    },
    {
        timestamps: true,
    }
);

const UserModel = mongoose.model('user', userSchema);
export default UserModel;
