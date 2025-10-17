import mongoose from 'mongoose';

const reviewSchema = mongoose.Schema(
    {
        reviewId: {
            type: String,
            unique: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
        },
        // userIdCrawl: {
        //     // type: String,
        //     // unique: true,
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: 'user',
        // },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'product',
        },
        productIdCrawl: {
            type: String, // dạng mã crawl như "275992556"
            index: true, // giúp truy vấn nhanh hơn
        },
        images: [
            {
                type: String,
                default: '',
            },
        ],
        isPhoto: {
            type: Boolean,
            default: false,
        },
        comment: {
            type: String,
            default: '',
        },
        title: {
            type: String,
            default: '',
        },
        rating: {
            type: String,
            default: 0,
        },
        replies: [
            {
                userId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'staff',
                },
                replyText: {
                    type: String,
                    required: true,
                },
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

const ReviewModel = mongoose.model('review', reviewSchema);
export default ReviewModel;
