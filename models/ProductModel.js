import mongoose from 'mongoose';
import slugify from 'slugify';

const productSchema = mongoose.Schema(
    {
        // _id: {
        //     type: String, // ép _id thành String
        // },
        productId: {
            type: String, // productId cho crawl product data
            unique: true,
        },
        name: {
            type: String,
        },
        slug: {
            type: String,
        },
        categorySlug: {
            // slug của categoryName
            type: String,
            default: '',
        },
        subCategorySlug: {
            // slug của categoryName
            type: String,
            default: '',
        },
        thirdSubCategorySlug: {
            // slug của categoryName
            type: String,
            default: '',
        },
        description: {
            type: String,
        },
        images: [
            {
                type: String,
            },
        ],
        brand: {
            type: String,
            default: '',
        },
        price: {
            type: Number,
            default: 0,
        },
        oldPrice: {
            type: Number,
            default: 0,
        },
        categoryId: {
            type: String,
            default: '',
        },
        categoryName: {
            type: String,
            default: '',
        },
        subCategoryId: {
            type: String,
            default: '',
        },
        subCategoryName: {
            type: String,
            default: '',
        },
        thirdSubCategoryId: {
            type: String,
            default: '',
        },
        thirdSubCategoryName: {
            type: String,
            default: '',
        },
        category: {
            type: mongoose.Schema.ObjectId,
            ref: 'category',
        },
        countInStock: {
            type: Number,
        },
        quantitySold: {
            type: Number,
            default: 0,
        },
        averageRating: {
            type: Number,
            default: 0,
        },
        reviewCount: {
            type: Number,
            default: 0,
        },
        review: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'review',
            },
        ],
        rating: {
            type: Number,
            default: 4,
        },
        isFeatured: {
            type: Boolean,
            default: false,
        },
        isPublished: {
            type: Boolean,
            default: true,
        },
        discount: {
            type: Number,
            // required: true,
        },
        productSize: [
            {
                type: String,
                default: null,
            },
        ],
        dateCreated: {
            type: Date,
            default: Date.now,
        },
        banners: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'banner',
            },
        ],
    },
    {
        timestamps: true,
    }
);

productSchema.pre('save', function (next) {
    // chỉ chạy khi tạo mới, không override khi update
    if (this.isNew && !this.slug) {
        // _id đã được generate trước khi save
        const baseSlug = slugify(this.name, { lower: true, strict: true });
        this.slug = `${baseSlug}-p${this._id}`;
    }
    next();
});

const ProductModel = mongoose.model('product', productSchema);
export default ProductModel;
