import { v2 as cloudinary } from 'cloudinary';
import slugify from 'slugify';

import redisConfig from '../config/redisConfig.js';
import CategoryModel from '../models/CategoryModel.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true,
});

const createCategory = async (req, res) => {
    try {
        const { name, parentCategoryName, parentId } = req.body;
        const images = req.files; // nhiều ảnh

        if (!name) {
            return res.status(500).json({
                success: false,
                message: 'Cần điền tên danh mục',
            });
        }

        // Slug
        const slug = slugify(name, {
            lower: true,
            strict: true,
            locale: 'vi',
        });

        const existingSlug = await CategoryModel.findOne({
            name: name.trim(),
            parentId: parentId ? parentId : null,
        });
        if (existingSlug) {
            return res.status(400).json({
                success: false,
                message: 'Tên danh mục đã tồn tại trong cùng cấp',
            });
        }

        // Parent slug
        const parentCategorySlug = parentCategoryName
            ? slugify(parentCategoryName, {
                  lower: true,
                  strict: true,
                  locale: 'vi',
              })
            : '';
        // Images
        let imageUrls = [];

        if (images && images.length > 0) {
            imageUrls = await Promise.all(
                images?.map(async (img) => {
                    const uploadedImage = await cloudinary.uploader.upload(img.path); // upload ảnh lên Cloudinary (hoặc bất kỳ dịch vụ nào khác)
                    return uploadedImage.url; // trả về URL ảnh đã tải lên
                })
            );
        }

        const newCategory = await CategoryModel.create({
            name,
            slug,
            parentCategoryName: parentCategoryName || '',
            parentCategorySlug,
            parentId: parentId || null,
            images: imageUrls,
        });

        return res.status(201).json({
            success: true,
            message: 'Tạo danh mục thành công',
            newCategory,
        });
    } catch (error) {
        console.error('Create category error: ', error);
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const updateCategory = async (req, res) => {
    try {
        const category = await CategoryModel.findById(req.params.id);
        if (!category) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy danh mục',
            });
        }

        const { name, parentId, parentCategoryName } = req.body;

        // Slug
        let slug = undefined;
        if (name) {
            slug = slugify(name, {
                lower: true,
                strict: true,
                locale: 'vi',
            });
            // Kiểm tra trùng slug nhưng loại trừ danh mục hiện tại
            // Nếu update danh mục giữ nguyên name → slug giữ nguyên, không báo lỗi.
            // Nếu đổi sang name mới mà trùng với danh mục khác → báo "Tên danh mục đã tồn tại".
            // Nếu đổi sang name mới khác → generate slug mới và update DB.
            const existingSlug = await CategoryModel.findOne({
                slug,
                _id: {
                    $ne: req.params.id,
                },
                parentId: parentId || null, //chỉ so sánh trong cùng cha, nếu khác cha vẫn dc trùng slug
            });
            if (existingSlug) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên danh mục đã tồn tại',
                });
            }
        }

        // Parent slug
        const parentCategorySlug = parentCategoryName
            ? slugify(parentCategoryName, {
                  lower: true,
                  strict: true,
                  locale: 'vi',
              })
            : '';

        // Images
        const deletedImages = req.body.deletedImages || []; // array các URL cần xoá

        if (deletedImages.length > 0) {
            category.images = category.images.filter((img) => !deletedImages.includes(img));
        }

        // --- Thêm ảnh mới nếu có ---
        const newImages = req.files?.map((file) => file.path) || [];

        if (newImages.length > 0) {
            // Sử dụng Promise.all để xử lý nhiều ảnh cùng một lúc
            await Promise.all(
                newImages.map((image) => {
                    return category.images.push(image); // Đẩy ảnh vào mảng images
                })
            );
        }

        // --- Cập nhật tên và danh mục cha ---
        category.name = name || category.name;
        if (slug) category.slug = slug;
        category.parentId = parentId || null;
        category.parentCategoryName = parentCategoryName || '';
        category.parentCategorySlug = parentCategorySlug;

        await category.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật danh mục thành công',
            updatedCategory: category,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const getCategoriesFromUser = async (req, res) => {
    try {
        // Kiểm tra cache
        const cacheCategories = await redisConfig.get('categories');
        if (cacheCategories) {
            console.log('Lấy categories từ cache');
            return res.status(200).json({
                success: true,
                categories: JSON.parse(cacheCategories),
            });
        }

        // Nếu không có cache → Query DB
        console.log('Lấy categories từ DB');
        const categories = await CategoryModel.find();
        const categoryMap = {};

        categories.forEach((category) => {
            categoryMap[category._id] = {
                ...category._doc,
                children: [],
            };
        });
        const rootCategories = [];
        categories.forEach((category) => {
            if (category.parentId) {
                // Nếu có parentId → là danh mục con → push vào children của danh mục cha
                categoryMap[category.parentId].children.push(categoryMap[category._id]);
            } else {
                // Nếu không có parentId → là danh mục gốc (root)
                rootCategories.push(categoryMap[category._id]);
            }
        });

        redisConfig.setex('categories', process.env.DEFAULT_EXPIRATION, JSON.stringify(rootCategories));

        return res.status(200).json({
            success: true,
            categories: rootCategories,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getJustCategoriesFromAdmin = async (req, res) => {
    try {
        let { field, value } = req.query;
        const filter = {
            parentId: null,
        };

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
            } else {
                filter[field] = { $regex: value, $options: 'i' };
            }
        }

        // phân trang
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || process.env.LIMIT_DEFAULT;
        const skip = (page - 1) * perPage;

        const [categories, totalCategories] = await Promise.all([
            CategoryModel.find(filter).skip(skip).limit(perPage),
            CategoryModel.countDocuments(filter),
        ]);

        // // const categories = await CategoryModel.find();
        // const categoryMap = {};
        // categories.forEach((category) => {
        //     categoryMap[category._id] = {
        //         ...category._doc,
        //         children: [],
        //     };
        // });

        // const rootCategories = [];
        // categories.forEach((category) => {
        //     // if (category.parentId) {
        //     if (category.parentId && categoryMap[category.parentId]) {
        //         // Nếu có parentId → là danh mục con → push vào children của danh mục cha
        //         categoryMap[category.parentId].children.push(categoryMap[category._id]);
        //     } else {
        //         // Nếu không có parentId → là danh mục gốc (root)
        //         rootCategories.push(categoryMap[category._id]);
        //     }
        // });

        return res.status(200).json({
            success: true,
            // categories: rootCategories,
            categories,
            totalPages: Math.ceil(totalCategories / perPage),
            totalCategories,
            page,
            perPage,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getCategoriesFromAdmin = async (req, res) => {
    try {
        const categories = await CategoryModel.find();
        const categoryMap = {};

        categories.forEach((category) => {
            categoryMap[category._id] = {
                ...category._doc,
                children: [],
            };
        });
        const rootCategories = [];
        categories.forEach((category) => {
            if (category.parentId) {
                // Nếu có parentId → là danh mục con → push vào children của danh mục cha
                categoryMap[category.parentId].children.push(categoryMap[category._id]);
            } else {
                // Nếu không có parentId → là danh mục gốc (root)
                rootCategories.push(categoryMap[category._id]);
            }
        });

        return res.status(200).json({
            success: true,
            categories: rootCategories,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getCategoriesCount = async (req, res) => {
    try {
        const categoryCount = await CategoryModel.countDocuments({ parentId: undefined });
        if (!categoryCount) {
            return res.status(400).json({
                success: false,
                message: 'Không đếm được số lượng danh mục!',
            });
        } else {
            return res.status(200).json({
                success: true,
                categoryCount,
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getSubCategoriesCount = async (req, res) => {
    try {
        const categories = await CategoryModel.find();
        if (!categories) {
            return res.status(400).json({
                success: false,
                message: 'Không có danh mục con',
            });
        } else {
            const subCatArr = [];
            for (let cat of categories) {
                if (cat.parentId !== undefined) {
                    subCatArr.push(cat);
                }
            }
            return res.status(200).json({
                success: true,
                subCategories: subCatArr.length,
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getDetailsCategory = async (req, res) => {
    try {
        const category = await CategoryModel.findById(req.params.id);
        if (!category) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy danh mục với id này',
            });
        }
        return res.status(200).json({
            success: true,
            category,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
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

const deleteCategory = async (req, res) => {
    try {
        const category = await CategoryModel.findById(req.params.id);
        const images = category.images;

        if (images.length > 0) {
            for (let img of images) {
                const imgUrl = img;
                const urlArr = imgUrl.split('/');
                const image = urlArr[urlArr.length - 1];
                const imageName = image.split('.')[0];

                if (imageName) {
                    await cloudinary.uploader.destroy(imageName);
                }
            }
        }
        // Tìm các danh mục con cấp 1
        const subCategory = await CategoryModel.find({
            parentId: req.params.id,
        });
        for (const sub of subCategory) {
            // Tìm các danh mục con cấp 2
            const thirdSubCategory = await CategoryModel.find({ parentId: sub._id });
            // Xoá tất cả danh mục cấp 2
            await Promise.all(thirdSubCategory.map((third) => CategoryModel.findByIdAndDelete(third._id)));
            // Xoá danh mục con cấp 1
            await CategoryModel.findByIdAndDelete(sub._id);
        }

        // Xoá danh mục gốc
        const deletedCat = await CategoryModel.findByIdAndDelete(req.params.id);
        if (!deletedCat) {
            return res.status(400).json({
                success: false,
                message: 'Danh mục không tồn tại',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Xoá danh mục thành công',
            subCategory,
            deletedCat,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const deleteMultipleCategories = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp id danh mục',
            });
        }

        const categories = await CategoryModel.find({ _id: { $in: ids } });
        const destroyImagePromises = categories.flatMap((product) => {
            const images = product.images || [];
            return images.map((img) => {
                const urlArr = img.split('/');
                const image = urlArr[urlArr.length - 1];
                const imageName = image.split('.')[0];
                return cloudinary.uploader.destroy(imageName);
            });
        });

        await Promise.all(destroyImagePromises);

        // Xoá tất cả sản phẩm
        await CategoryModel.deleteMany({ _id: { $in: ids } });
        return res.status(200).json({
            success: true,
            message: 'Xoá danh mục thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error,
        });
    }
};

export {
    createCategory,
    getCategoriesFromUser,
    getJustCategoriesFromAdmin,
    getCategoriesFromAdmin,
    getCategoriesCount,
    getSubCategoriesCount,
    getDetailsCategory,
    removeImageFromCloudinary,
    deleteCategory,
    deleteMultipleCategories,
    updateCategory,
};
