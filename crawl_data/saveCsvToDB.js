import mongoose from 'mongoose';
import csv from 'csvtojson';
import UserModel from '../models/UserModel.js';
import ProductModel from '../models/ProductModel.js';
import ReviewModel from '../models/ReviewModel.js';
import CategoryModel from '../models/CategoryModel.js';

const BATCH_SIZE = 100;

mongoose.connect('mongodb://127.0.0.1:27017/rubystore', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

function safeParseArray(str) {
    if (!str) return [];
    try {
        return JSON.parse(str.replace(/'/g, '"'));
    } catch (e) {
        console.error('❌ Parse fail:', str);
        return [];
    }
}

const saveProductsToDB = async () => {
    const products = await csv().fromFile('crawl_data/tui-xach-cong-so-nam/details_product_ncds.csv');
    console.log('Length products:', products.length);

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (p) => {
                try {
                    // ===== CATEGORY CẤP 1 =====
                    let category = await CategoryModel.findOne({ slug: p.categorySlug });
                    if (!category) {
                        category = await CategoryModel.create({
                            _id: p.categoryId,
                            name: p.categoryName,
                            slug: p.categorySlug,
                            parentId: null,
                            parentCategoryName: null,
                            parentCategorySlug: null,
                        });
                    }

                    // ===== CATEGORY CẤP 2 =====
                    let subCategory = null;
                    if (p.subCategorySlug) {
                        subCategory = await CategoryModel.findOne({ slug: p.subCategorySlug });
                        if (!subCategory) {
                            subCategory = await CategoryModel.create({
                                _id: p.subCategoryId,
                                name: p.subCategoryName,
                                slug: p.subCategorySlug,
                                parentId: category._id,
                                parentCategoryName: category.name,
                                parentCategorySlug: category.slug,
                            });
                        }
                    }

                    // ===== CATEGORY CẤP 3 =====
                    let thirdSubCategory = null;
                    if (p.thirdSubCategorySlug) {
                        thirdSubCategory = await CategoryModel.findOne({ slug: p.thirdSubCategorySlug });
                        if (!thirdSubCategory) {
                            thirdSubCategory = await CategoryModel.create({
                                _id: p.thirdSubCategoryId,
                                name: p.thirdSubCategoryName,
                                slug: p.thirdSubCategorySlug,
                                parentId: subCategory?._id,
                                parentCategoryName: subCategory?.name,
                                parentCategorySlug: subCategory?.slug,
                            });
                        }
                    }

                    const newProduct = {
                        productId: p.productId,
                        name: p.name,
                        slug: p.slug,
                        sku: p.sku,
                        images: safeParseArray(p.images),
                        description: p.description,
                        short_description: p.short_description,
                        brand: p.brand,
                        oldPrice: Number(p.oldPrice) || 0,
                        discount: Number(p.discount) || 0,
                        price: Number(p.price) || 0,
                        averageRating: Number(p.averageRating) || 0,
                        reviewCount: Number(p.reviewCount) || 0,
                        countInStock: Number(p.countInStock) || 0,
                        quantitySold: Number(p.quantitySold) || 0,
                        productSize: safeParseArray(p.productSize),
                        isFeatured: true,
                        isPublished: true,

                        category: category._id,
                        categoryId: category._id,
                        categoryName: category.name,
                        categorySlug: category.slug,
                        subCategoryId: subCategory?._id,
                        subCategoryName: subCategory?.name,
                        subCategorySlug: subCategory?.slug,
                        thirdSubCategoryId: thirdSubCategory?._id,
                        thirdSubCategoryName: thirdSubCategory?.name,
                        thirdSubCategorySlug: thirdSubCategory?.slug,
                    };

                    await ProductModel.findOneAndUpdate({ productId: p.productId }, newProduct, {
                        upsert: true,
                        new: true,
                    });

                    console.log(`✅ Imported product: ${p.name}`);
                } catch (err) {
                    console.error(`❌ Error importing ${p.name}:`, err.message);
                }
            })
        );

        console.log(`📦 Done batch ${i} - ${i + BATCH_SIZE}`);
    }
};

const saveUsersToDB = async () => {
    const users = await csv().fromFile('crawl_data/tui-xach-cong-so-nam/users_ncds.csv');
    console.log('Length users:', users.length);

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (u) => {
                try {
                    const newUser = {
                        userId: u.userId,
                        name: u.name,
                        email: u.email,
                        password: u.password,
                        emailVerified: true,
                        lastLoginDate: new Date(),
                    };

                    await UserModel.findOneAndUpdate({ userId: u.userId }, newUser, { upsert: true, new: true });

                    console.log(`✅ Imported user: ${u.name}`);
                } catch (err) {
                    console.error(`❌ Error importing ${u.name}:`, err.message);
                }
            })
        );

        console.log(`📦 Done batch ${i} - ${i + BATCH_SIZE}`);
    }
};

const saveReviewsToDB = async () => {
    const reviews = await csv().fromFile('crawl_data/tui-xach-cong-so-nam/reviews_ncds.csv');
    console.log('Length reviews:', reviews.length);

    for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
        const batch = reviews.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (r) => {
                try {
                    const user = await UserModel.findOne({ userId: r.userId });
                    if (!user) {
                        console.warn(`⚠️ User ${r.userId} không tồn tại trong DB`);
                        return;
                    }

                    const product = await ProductModel.findOne({ productId: r.productId });
                    if (!product) {
                        console.warn(`⚠️ Product ${r.productId} không tồn tại trong DB`);
                        return;
                    }

                    const newReview = {
                        reviewId: r.reviewId,
                        userId: user._id,
                        productId: product._id,
                        comment: r.comment,
                        title: r.title,
                        rating: r.rating,
                    };

                    await ReviewModel.findOneAndUpdate({ reviewId: r.reviewId }, newReview, {
                        upsert: true,
                        new: true,
                    });

                    console.log(`✅ Imported review: ${r.comment}`);
                } catch (err) {
                    console.error(`❌ Error importing review:`, err.message);
                }
            })
        );

        console.log(`📦 Done batch ${i} - ${i + BATCH_SIZE}`);
    }
};

Promise.all([saveProductsToDB()]).then(() => {
    console.log('🎉 All data imported!');
    mongoose.connection.close();
});

// saveReviewsToDB();
