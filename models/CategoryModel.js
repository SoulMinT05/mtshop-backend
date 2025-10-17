import mongoose from 'mongoose';

const categorySchema = mongoose.Schema(
    {
        name: {
            type: String,
            // required: true,
            trim: true,
        },
        images: [
            {
                type: String,
            },
        ],
        slug: {
            type: String,
        },
        parentCategorySlug: {
            type: String,
            default: null,
        },

        parentCategoryName: {
            type: String,
        },
        parentId: {
            type: mongoose.Schema.ObjectId,
            ref: 'category',
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const CategoryModel = mongoose.model('category', categorySchema);
export default CategoryModel;
