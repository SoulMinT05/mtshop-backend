import mongoose from 'mongoose';
import slugify from 'slugify';
import csv from 'csvtojson';
import fs from 'fs';
import path from 'path';

import ProductModel from '../models/ProductModel.js'; // chỉnh path cho đúng
import BlogModel from '../models/BlogModel.js';
import CategoryModel from '../models/CategoryModel.js';
import ReviewModel from '../models/ReviewModel.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017/rubystore';

// Hàm loại bỏ dấu tiếng Việt
function removeVietnameseTones(str) {
    return str
        .normalize('NFD') // chuẩn hóa Unicode
        .replace(/[\u0300-\u036f]/g, '') // loại bỏ dấu
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .replace(/[,/&]/g, ' ') // thay dấu phẩy, /, & thành khoảng trắng
        .replace(/\s+/g, ' ') // gộp nhiều khoảng trắng
        .trim();
}

const updateCategorySlug = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const products = await CategoryModel.find({ slug: { $exists: false } }); // tìm product chưa có slug
        console.log(`🔍 Found ${products.length} products without slug`);

        for (let product of products) {
            const cleanName = removeVietnameseTones(product.name);
            product.slug = slugify(cleanName, { lower: true, strict: true });
            await product.save();
            console.log(`✔ Updated slug for: ${product.name} → ${product.slug}`);
        }

        console.log('🎉 All slugs updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating slugs:', error);
        process.exit(1);
    }
};

const updateParentCategorySlug = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Tìm tất cả category
        const categories = await CategoryModel.find({});
        console.log(`🔍 Found ${categories.length} categories`);

        for (let category of categories) {
            if (category.parentCategoryName) {
                const cleanName = removeVietnameseTones(category.parentCategoryName);
                const newParentSlug = slugify(cleanName, { lower: true, strict: true });

                if (category.parentCategorySlug !== newParentSlug) {
                    category.parentCategorySlug = newParentSlug;
                    await category.save();
                    console.log(`✔ Updated parentCategorySlug for: ${category.name} → ${newParentSlug}`);
                }
            } else {
                // Nếu không có parentCategoryName thì để rỗng
                if (category.parentCategorySlug !== '') {
                    category.parentCategorySlug = '';
                    await category.save();
                    console.log(`✔ Cleared parentCategorySlug for: ${category.name}`);
                }
            }
        }

        console.log('🎉 All parentCategorySlug updated successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating parentCategorySlug:', error);
        process.exit(1);
    }
};

const migrateCategorySlug = async () => {
    try {
        const products = await ProductModel.find();

        for (let product of products) {
            const categorySlug = product.categoryName
                ? slugify(product.categoryName, { lower: true, locale: 'vi' })
                : '';

            const subCategorySlug = product.subCategoryName
                ? slugify(product.subCategoryName, { lower: true, locale: 'vi' })
                : '';

            const thirdSubCategorySlug = product.thirdSubCategoryName
                ? slugify(product.thirdSubCategoryName, { lower: true, locale: 'vi' })
                : '';

            product.categorySlug = categorySlug;
            product.subCategorySlug = subCategorySlug;
            product.thirdSubCategorySlug = thirdSubCategorySlug;

            await product.save();

            console.log(
                `✅ Updated ${product.name} -> categorySlug: ${categorySlug || 'null'}, subCategorySlug: ${
                    subCategorySlug || 'null'
                }, thirdSubCategorySlug: ${thirdSubCategorySlug || 'null'}`
            );
        }

        console.log('🎉 Done migrate categorySlug + subCategorySlug + thirdSubCategorySlug');
    } catch (err) {
        console.error('❌ Error migrating categorySlug:', err);
    }
};

const migrateProductSlug = async () => {
    try {
        const products = await ProductModel.find();

        for (let product of products) {
            // Trường hợp slug đã có id ở cuối thì bỏ qua
            // if (product.slug && product.slug.includes(product._id.toString())) {
            //     console.log(`⏭ Skip ${product.name}, slug đã có id`);
            //     continue;
            // }

            const baseSlug = slugify(product.name, {
                lower: true,
                strict: true,
                locale: 'vi',
            });

            const newSlug = `${baseSlug}-p${product._id}`;

            product.slug = newSlug;
            await product.save();

            console.log(`✅ Updated ${product.name} -> slug: ${newSlug}`);
        }

        console.log('🎉 Done migrate product slug');
    } catch (err) {
        console.error('❌ Error migrating product slug:', err);
    }
};

const updateTitleByRating = async () => {
    try {
        const reviews = await ReviewModel.find();

        for (let review of reviews) {
            let newTitle = '';
            const rating = Number(review.rating);

            switch (rating) {
                case 5:
                    newTitle = 'Cực kỳ hài lòng';
                    break;
                case 4:
                    newTitle = 'Hài lòng';
                    break;
                case 3:
                    newTitle = 'Bình thường';
                    break;
                case 2:
                    newTitle = 'Không hài lòng';
                    break;
                case 1:
                    newTitle = 'Rất tệ';
                    break;
                default:
                    newTitle = review.title || '';
            }

            if (newTitle) {
                review.title = newTitle;
                await review.save();
                console.log(`✅ Updated review ${review._id} -> title: ${newTitle}`);
            }
        }

        console.log('🎉 Done update review title by rating');
    } catch (err) {
        console.error('❌ Error updating review title by rating:', err);
    }
};

const exportCategoryTree = async () => {
    const products = await csv().fromFile('crawl_data/tui-xach-cong-so-nam/details_product_ncds.csv');

    // Dùng object để lưu cây
    const categoryTree = {};

    for (let p of products) {
        const c1 = p.categoryName?.trim();
        const c2 = p.subCategoryName?.trim();
        const c3 = p.thirdSubCategoryName?.trim();

        const c1Slug = p.categorySlug?.trim();
        const c2Slug = p.subCategorySlug?.trim();
        const c3Slug = p.thirdSubCategorySlug?.trim();

        if (!c1) continue;

        if (!categoryTree[c1]) {
            categoryTree[c1] = { slug: c1Slug, children: {} };
        }

        if (c2) {
            if (!categoryTree[c1].children[c2]) {
                categoryTree[c1].children[c2] = { slug: c2Slug, children: new Set() };
            }

            if (c3) {
                // Lưu dưới dạng string để Set không bị trùng
                categoryTree[c1].children[c2].children.add(`${c3}|${c3Slug}`);
            }
        }
    }

    // Chuyển Set → Array object
    const treeForExport = {};
    for (let c1 in categoryTree) {
        treeForExport[c1] = {
            slug: categoryTree[c1].slug,
            children: {},
        };

        for (let c2 in categoryTree[c1].children) {
            const childrenSet = categoryTree[c1].children[c2].children;
            treeForExport[c1].children[c2] = {
                slug: categoryTree[c1].children[c2].slug,
                children: Array.from(childrenSet).map((item) => {
                    const [name, slug] = item.split('|');
                    return { name, slug };
                }),
            };
        }
    }

    // Ghi ra file JSON
    fs.writeFileSync('crawl_data/category_tree.json', JSON.stringify(treeForExport, null, 2), 'utf-8');

    console.log('✅ Exported category tree (no duplicates) to crawl_data/category_tree.json');
};

const findProductByCrawlId = async () => {
    try {
        const crawlId = '275992556';

        // Tìm trong ProductModel có field productId (crawl) = 275992556
        const product = await ProductModel.findOne({ productId: crawlId }).select('_id name productId slug');

        if (!product) {
            console.log('❌ Không tìm thấy sản phẩm có productId =', crawlId);
        } else {
            console.log('✅ Tìm thấy sản phẩm:');
            console.log(product);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi tìm sản phẩm:', error);
        process.exit(1);
    }
};

const updateProductIdCrawl = async () => {
    try {
        const oldValue = '275992556';

        // Tìm và cập nhật tất cả review có productId = 275992556
        const result = await ReviewModel.updateMany(
            { productId: oldValue }, // điều kiện
            { $set: { productIdCrawl: String(oldValue) } } // cập nhật thêm field mới
        );

        console.log(`✅ Đã cập nhật ${result.modifiedCount} document`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật:', error);
        process.exit(1);
    }
};

mongoose.connect('mongodb://127.0.0.1:27017/rubystore').then(async () => {
    // updateCategorySlug();
    // updateParentCategorySlug();
    // await migrateCategorySlug();
    // await migrateProductSlug();
    // await updateTitleByRating();
    // await exportCategoryTree();
    await findProductByCrawlId();
    // await updateProductIdCrawl();
    mongoose.disconnect();
});
