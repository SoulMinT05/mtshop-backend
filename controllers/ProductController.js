import slugify from 'slugify';
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

import UserModel from '../models/UserModel.js';
import ProductModel from '../models/ProductModel.js';
import ProductRamModel from '../models/ProductRamModel.js';
import ProductWeightModel from '../models/ProductWeightModel.js';
import ProductSizeModel from '../models/ProductSizeModel.js';
import CategoryModel from '../models/CategoryModel.js';

import redisConfig from '../config/redisConfig.js';
import { normalizeProductsExceptId, normalizeProductId } from '../utils/normalizeUtils.js';
import { updateProductSlug } from '../utils/slugUtils.js';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
    secure: true,
});

const createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            brand,
            price,
            oldPrice,
            categoryName,
            categoryId,
            subCategoryId,
            subCategoryName,
            thirdSubCategoryId,
            thirdSubCategoryName,
            countInStock,
            rating,
            isFeatured,
            isPublished,
            discount,
            productRam,
            productSize,
            productWeight,
        } = req.body;

        if (!name || !description) {
            return res.status(400).json({
                success: false,
                message: 'Cần nhập tên, và mô tả sản phẩm',
            });
        }

        const slug = slugify(name, {
            lower: true,
            strict: true,
            locale: 'vi',
        });

        const existingSlug = await ProductModel.findOne({ slug });
        if (existingSlug) {
            return res.status(400).json({
                success: false,
                message: 'Tên sản phẩm đã tồn tại',
            });
        }

        // --- Slug cho category / subCategory / thirdSubCategory ---
        const categorySlug = categoryName ? slugify(categoryName, { lower: true, locale: 'vi', strict: true }) : '';
        const subCategorySlug = subCategoryName
            ? slugify(subCategoryName, { lower: true, locale: 'vi', strict: true })
            : '';
        const thirdSubCategorySlug = thirdSubCategoryName
            ? slugify(thirdSubCategoryName, { lower: true, locale: 'vi', strict: true })
            : '';

        // Handle images
        const images = req.files; // nhiều ảnh

        console.log(
            'Files nhận từ FE:',
            req.files.map((f) => f.originalname)
        );
        let imageUrls = [];
        if (images && images.length > 0) {
            imageUrls = await Promise.all(
                images?.map(async (img) => {
                    const uploadedImage = await cloudinary.uploader.upload(img.path, {
                        resource_type: 'image', // chỉ upload ảnh, tránh Cloudinary đoán
                        overwrite: false, // không ghi đè
                        unique_filename: true, // đảm bảo tên file duy nhất
                        use_filename: true,
                    }); // upload ảnh lên Cloudinary (hoặc bất kỳ dịch vụ nào khác)

                    return uploadedImage.url; // trả về URL ảnh đã tải lên
                })
            );
        }

        // Create product
        const newProduct = await ProductModel.create({
            name,
            // slug,
            images: imageUrls,
            description,
            brand,
            price:
                price !== undefined ? price : oldPrice && discount ? oldPrice - (oldPrice * discount) / 100 : oldPrice,
            oldPrice,
            categoryName,
            categoryId,
            subCategoryId,
            subCategoryName,
            thirdSubCategoryId,
            thirdSubCategoryName,
            categorySlug,
            subCategorySlug,
            thirdSubCategorySlug,
            category: categoryId,
            countInStock,
            rating,
            isFeatured,
            isPublished,
            discount,
            productRam,
            productSize,
            productWeight,
        });

        if (!newProduct) {
            return res.status(400).json({
                success: false,
                message: 'Tạo sản phẩm thất bại!',
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Tạo sản phẩm thành công',
            newProduct,
        });
    } catch (error) {
        console.error('Create category error: ', error);
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const createProductSize = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Cần nhập size sản phẩm',
            });
        }

        const existingProductSize = await ProductSizeModel.findOne({ name });
        if (existingProductSize) {
            return res.status(400).json({
                success: false,
                message: 'Size này đã tồn tại!',
            });
        }

        const newProductSize = await ProductSizeModel.create({
            name,
        });
        if (!newProductSize) {
            return res.status(400).json({
                success: false,
                message: 'Tạo size sản phẩm thất bại!',
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Tạo size sản phẩm thành công',
            newProductSize,
        });
    } catch (error) {
        console.error('Create category error: ', error);
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsAdmin = async (req, res) => {
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
            } else if (
                field === 'categoryId' ||
                field === 'subCategoryId' ||
                field === 'thirdSubCategoryId' ||
                field === 'rating'
            ) {
                filter[field] = value;
            } else if (field === 'isFeatured') {
                if (value === 'true') filter[field] = true;
                else if (value === 'false') filter[field] = false;
            } else if (field === 'price') {
                // lọc theo khoảng giá
                if (value === '<200') {
                    filter[field] = { $lt: 200000 };
                } else if (value === '200-500') {
                    filter[field] = { $gte: 200000, $lte: 500000 };
                } else if (value === '500-1000') {
                    filter[field] = { $gte: 500000, $lte: 1000000 };
                } else if (value === '1000-5000') {
                    filter[field] = { $gte: 1000000, $lte: 5000000 };
                } else if (value === '>5000') {
                    filter[field] = { $gt: 5000000 };
                }
            } else if (field === 'countInStock') {
                // lọc theo khoảng giá
                if (value === '0') {
                    filter[field] = 0;
                } else if (value === '1-100') {
                    filter[field] = { $gte: 1, $lte: 100 };
                } else if (value === '100-500') {
                    filter[field] = { $gte: 100, $lte: 500 };
                } else if (value === '500-1000') {
                    filter[field] = { $gte: 500, $lte: 1000 };
                } else if (value === '>1000') {
                    filter[field] = { $gt: 1000 };
                }
            } else if (field === 'discount') {
                // lọc theo khoảng giá
                if (value === '<2%') {
                    filter[field] = { $lt: 2 };
                } else if (value === '2%-5%') {
                    filter[field] = { $gte: 2, $lte: 5 };
                } else if (value === '5%-10%') {
                    filter[field] = { $gte: 5, $lte: 10 };
                } else if (value === '10%-20%') {
                    filter[field] = { $gte: 10, $lte: 20 };
                } else if (value === '>20%') {
                    filter[field] = { $gt: 20 };
                }
            } else {
                // name, description,... => regex tìm kiếm
                filter[field] = { $regex: value, $options: 'i' };
            }
        }

        // phân trang
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || process.env.LIMIT_DEFAULT;
        const skip = (page - 1) * perPage;

        const [products, totalProducts] = await Promise.all([
            ProductModel.find(filter).populate('category').skip(skip).limit(perPage),
            ProductModel.countDocuments(filter),
        ]);

        res.status(200).json({
            success: true,
            products,
            totalPages: Math.ceil(totalProducts / perPage),
            totalProducts,
            page,
            perPage,
        });
    } catch (error) {
        console.error('getProductsAdmin error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsUser = async (req, res) => {
    try {
        // phân trang
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const skip = (page - 1) * perPage;

        const filter = { isPublished: true };

        // cache key phân biệt page & perPage
        const cacheKey = `products:user?page=${page}&perPage=${perPage}`;

        const cachedProducts = await redisConfig.get(cacheKey);
        if (cachedProducts) {
            console.log('Lấy products user từ Cache');
            const { products, totalProducts } = JSON.parse(cachedProducts);
            return res.status(200).json({
                success: true,
                products,
                totalPages: Math.ceil(totalProducts / perPage),
                totalProducts,
                page,
                perPage,
            });
        }

        console.log('Lấy products user từ DB');
        const [products, totalProducts] = await Promise.all([
            ProductModel.find(filter).skip(skip).limit(perPage).exec(),
            ProductModel.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages && totalProducts > 0) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        // lưu cache kèm totalProducts để trả đúng
        redisConfig.setex(
            cacheKey,
            parseInt(process.env.DEFAULT_EXPIRATION),
            JSON.stringify({ products, totalProducts })
        );

        return res.status(200).json({
            success: true,
            products,
            totalPages,
            totalProducts,
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

const getLatestProducts = async (req, res) => {
    try {
        // Lấy query phân trang
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const skip = (page - 1) * perPage;

        const filter = { isFeatured: true, isPublished: true };

        // cache key riêng biệt cho feature
        const cacheKey = `products:featured?page=${page}&perPage=${perPage}`;

        // Kiểm tra cache
        const cachedProducts = await redisConfig.get(cacheKey);
        if (cachedProducts) {
            console.log('✅ Lấy featured products từ Cache');
            const { products, totalProducts } = JSON.parse(cachedProducts);
            return res.status(200).json({
                success: true,
                products,
                totalPages: Math.ceil(totalProducts / perPage),
                totalProducts,
                page,
                perPage,
            });
        }

        console.log('🗃️ Lấy featured products từ DB');
        const [products, totalProducts] = await Promise.all([
            ProductModel.find(filter).populate('category').sort({ createdAt: -1 }).skip(skip).limit(perPage).exec(),
            ProductModel.countDocuments(filter),
        ]);

        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages && totalProducts > 0) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        // Lưu cache
        await redisConfig.setEx(
            cacheKey,
            parseInt(process.env.DEFAULT_EXPIRATION),
            JSON.stringify({ products, totalProducts })
        );

        return res.status(200).json({
            success: true,
            products,
            totalPages,
            totalProducts,
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

const getProductsSize = async (req, res) => {
    try {
        const productsSize = await ProductSizeModel.find();
        if (!productsSize) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy size sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            productsSize,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByCategorySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 20;

        let query = { isPublished: true };
        let level = 'category';

        // 1. Ưu tiên check thirdSubCategorySlug
        const existThird = await ProductModel.exists({ thirdSubCategorySlug: slug });
        if (existThird) {
            query.thirdSubCategorySlug = slug;
            level = 'thirdSubCategory';
        } else {
            // 2. Check subCategorySlug
            const existSub = await ProductModel.exists({ subCategorySlug: slug });
            if (existSub) {
                query.subCategorySlug = slug;
                level = 'subCategory';
            } else {
                // 3. Check categorySlug
                const category = await CategoryModel.findOne({ slug });
                if (!category) {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy danh mục',
                    });
                }

                // lấy toàn bộ slug con cháu
                const collectSlugs = async (slug) => {
                    const slugs = [slug];
                    const children = await CategoryModel.find({ parentCategorySlug: slug }).select('slug');
                    for (let child of children) {
                        const subSlugs = await collectSlugs(child.slug);
                        slugs.push(...subSlugs);
                    }
                    return slugs;
                };
                const allSlugs = await collectSlugs(slug);
                console.log('allSlugs: ', allSlugs);

                query.$or = [
                    { categorySlug: { $in: allSlugs } },
                    { subCategorySlug: { $in: allSlugs } },
                    { thirdSubCategorySlug: { $in: allSlugs } },
                ];
                level = 'category';
            }
        }

        // 4. Query product
        const totalProducts = await ProductModel.countDocuments(query);
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages && totalProducts > 0) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find(query)
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
            count: products.length,
            searchLevel: level, // debug: third / sub / category
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByCategoryId = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            categoryId: req.params.id,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            categoryId: req.params.id,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByCategoryName = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            categoryName: req.query.categoryName,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            categoryName: req.query.categoryName,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsBySubCategoryId = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            subCategoryId: req.params.id,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            subCategoryId: req.params.id,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsBySubCategoryName = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            subCategoryName: req.query.subCategoryName,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            subCategoryName: req.query.subCategoryName,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByThirdSubCategoryId = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            thirdSubCategoryId: req.params.id,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            thirdSubCategoryId: req.params.id,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByThirdSubCategoryName = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);
        const totalProducts = await ProductModel.countDocuments({
            isPublished: true,
            thirdSubCategoryName: req.query.thirdSubCategoryName,
        });
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        const products = await ProductModel.find({
            isPublished: true,
            thirdSubCategoryName: req.query.thirdSubCategoryName,
        })
            .populate('category')
            .skip((page - 1) * perPage)
            .limit(perPage)
            .exec();

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsByPrice = async (req, res) => {
    try {
        let productList = [];

        if (req.query.categoryId !== '' && req.query.categoryId !== undefined) {
            const productListArr = await ProductModel.find({
                isPublished: true,
                categoryId: req.query.categoryId,
            }).populate('category');

            productList = productListArr;
        }

        if (req.query.subCategoryId !== '' && req.query.subCategoryId !== undefined) {
            const productListArr = await ProductModel.find({
                isPublished: true,
                subCategoryId: req.query.subCategoryId,
            }).populate('category');

            productList = productListArr;
        }

        if (req.query.thirdSubCategoryId !== '' && req.query.thirdSubCategoryId !== undefined) {
            const productListArr = await ProductModel.find({
                isPublished: true,
                thirdSubCategoryId: req.query.thirdSubCategoryId,
            }).populate('category');

            productList = productListArr;
        }

        const filterProducts = productList.filter((product) => {
            if (req.query.minPrice && product.price < parseInt(+req.query.minPrice)) {
                return false;
            }
            if (req.query.maxPrice && product.price > parseInt(+req.query.maxPrice)) {
                return false;
            }
            return true;
        });
        return res.status(200).json({
            success: true,
            filterProducts,
            totalPages: 0,
            page: 0,
        });
    } catch (error) {}
};

const getProductsByRating = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || parseInt(process.env.LIMIT_PRODUCTS);

        const filterQuery = {
            isPublished: true,
            rating: req.query.rating,
        };
        // Ưu tiên category theo thứ tự: categoryId > subCategoryId > thirdSubCategoryId
        if (req.query.categoryId) {
            filterQuery.categoryId = req.query.categoryId;
        }
        if (req.query.subCategoryId) {
            filterQuery.subCategoryId = req.query.subCategoryId;
        }
        if (req.query.thirdSubCategoryId) {
            filterQuery.thirdSubCategoryId = req.query.thirdSubCategoryId;
        }

        const totalProducts = await ProductModel.countDocuments(filterQuery);
        const totalPages = Math.ceil(totalProducts / perPage);

        if (page > totalPages) {
            return res.status(404).json({
                success: false,
                message: 'Trang không tìm thấy',
            });
        }

        let products = [];
        if (req.query.categoryId !== undefined) {
            products = await ProductModel.find({
                isPublished: true,
                rating: req.query.rating,
                categoryId: req.query.categoryId,
            })
                .populate('category')
                .skip((page - 1) * perPage)
                .limit(perPage)
                .exec();
        }

        if (req.query.subCategoryId !== undefined) {
            products = await ProductModel.find({
                isPublished: true,
                rating: req.query.rating,
                subCategoryId: req.query.subCategoryId,
            })
                .populate('category')
                .skip((page - 1) * perPage)
                .limit(perPage)
                .exec();
        }

        if (req.query.thirdSubCategoryId !== undefined) {
            products = await ProductModel.find({
                isPublished: true,
                rating: req.query.rating,
                thirdSubCategoryId: req.query.thirdSubCategoryId,
            })
                .populate('category')
                .skip((page - 1) * perPage)
                .limit(perPage)
                .exec();
        }

        if (!products) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            products,
            totalPages,
            page,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getProductsCount = async (req, res) => {
    try {
        const productsCount = await ProductModel.countDocuments({
            isPublished: true,
        });
        if (!productsCount) {
            return res.status(500).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        return res.status(200).json({
            success: true,
            productsCount,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const query = normalizeProductId(productId);

        const product = await ProductModel.findOne(query).populate('category');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }
        const images = product.images;
        for (const img of images) {
            const imgUrl = img;
            const urlArr = imgUrl.split('/');
            const image = urlArr[urlArr.length - 1];
            const imageName = image.split('.')[0];

            if (imageName) {
                await cloudinary.uploader.destroy(imageName);
            }
        }

        const deletedProduct = await ProductModel.findOneAndDelete(query);
        if (!deletedProduct) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm để xoá',
            });
        }
        return res.status(200).json({
            success: true,
            deletedProduct,
            message: 'Xoá sản phẩm thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const deleteMultipleProduct = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp id sản phẩm',
            });
        }

        const products = await ProductModel.find({ _id: { $in: ids } });
        const destroyImagePromises = products.flatMap((product) => {
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
        await ProductModel.deleteMany({ _id: { $in: ids } });
        return res.status(200).json({
            success: true,
            message: 'Xoá sản phẩm thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error,
        });
    }
};

const deleteProductRam = async (req, res) => {
    try {
        const productRam = await ProductRamModel.findByIdAndDelete(req.params.id);
        if (!productRam) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        return res.status(200).json({
            success: true,
            deletedProductRam: productRam,
            message: 'Xoá RAM sản phẩm thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const deleteMultipleProductRam = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp id RAM sản phẩm',
            });
        }

        const productsRam = await ProductRamModel.find({ _id: { $in: ids } });

        // Xoá tất cả sản phẩm
        await ProductRamModel.deleteMany({ _id: { $in: ids } });
        return res.status(200).json({
            success: true,
            message: 'Xoá RAM sản phẩm thành công',
            productsRam,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error,
        });
    }
};

const deleteProductWeight = async (req, res) => {
    try {
        const productWeight = await ProductWeightModel.findByIdAndDelete(req.params.id);
        if (!productWeight) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        return res.status(200).json({
            success: true,
            deletedProductWeight: productWeight,
            message: 'Xoá cân nặng sản phẩm thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const deleteMultipleProductWeight = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp id cân nặng sản phẩm',
            });
        }

        const productsWeight = await ProductWeightModel.find({ _id: { $in: ids } });

        // Xoá tất cả sản phẩm
        await ProductWeightModel.deleteMany({ _id: { $in: ids } });
        return res.status(200).json({
            success: true,
            message: 'Xoá cân nặng sản phẩm thành công',
            productsWeight,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error,
        });
    }
};

const deleteProductSize = async (req, res) => {
    try {
        const productSize = await ProductSizeModel.findByIdAndDelete(req.params.id);
        if (!productSize) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        return res.status(200).json({
            success: true,
            deletedProductSize: productSize,
            message: 'Xoá size sản phẩm thành công',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const deleteMultipleProductSize = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({
                success: false,
                message: 'Cần cung cấp id size sản phẩm',
            });
        }

        const productsSize = await ProductSizeModel.find({ _id: { $in: ids } });

        // Xoá tất cả sản phẩm
        await ProductSizeModel.deleteMany({ _id: { $in: ids } });
        return res.status(200).json({
            success: true,
            message: 'Xoá size sản phẩm thành công',
            productsSize,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error,
        });
    }
};

const getDetailsProductFromAdmin = async (req, res) => {
    try {
        const productId = req.params.id;
        const query = normalizeProductId(productId);

        // Query DB
        console.log('Lấy details product từ DB');
        const product = await ProductModel.findOne(query)
            .populate('category')
            .populate({
                path: 'review', // field trong ProductModel
                populate: {
                    path: 'userId', // field trong Review model
                    select: 'name email avatar', // chỉ lấy các field cần thiết
                },
            });
        if (!product) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm với id này',
            });
        }

        return res.status(200).json({
            success: true,
            product,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getDetailsProductFromUser = async (req, res) => {
    try {
        const productId = req.params.id;
        const cacheKey = `product:user:${productId}`;

        // Kiểm tra cache
        const cacheDetailsProduct = await redisConfig.get(cacheKey);
        if (cacheDetailsProduct) {
            console.log('Lấy details product từ cache');
            return res.status(200).json({
                success: true,
                product: JSON.parse(cacheDetailsProduct),
            });
        }

        // Query DB
        console.log('Lấy details product từ DB');
        const query = normalizeProductId(productId);
        const product = await ProductModel.findOne(query).populate('category');
        if (!product) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm với id này',
            });
        }

        redisConfig.setex(cacheKey, process.env.DEFAULT_EXPIRATION, JSON.stringify(product));

        return res.status(200).json({
            success: true,
            product,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getDetailsProductFromUserBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const cacheKey = `product:user:${slug}`;

        // Kiểm tra cache
        const cacheDetailsProduct = await redisConfig.get(cacheKey);
        if (cacheDetailsProduct) {
            console.log('Lấy details product từ cache');
            return res.status(200).json({
                success: true,
                product: JSON.parse(cacheDetailsProduct),
            });
        }

        // Query DB
        console.log('Lấy details product từ DB');
        const product = await ProductModel.findOne({ slug }).populate('category');
        if (!product) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm với slug này',
            });
        }

        redisConfig.setex(cacheKey, process.env.DEFAULT_EXPIRATION, JSON.stringify(product));

        return res.status(200).json({
            success: true,
            product,
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

const updateProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            brand,
            oldPrice,
            categoryName,
            categoryId,
            category,
            subCategoryId,
            subCategoryName,
            thirdSubCategoryId,
            thirdSubCategoryName,
            countInStock,
            rating,
            isFeatured,
            isPublished,
            discount,
            productRam,
            productSize,
            productWeight,
        } = req.body;

        // Price and Discount
        const numericOldPrice = Number(oldPrice);
        const numericDiscount = Number(discount);
        const numericPrice =
            numericOldPrice > 0 ? Math.max(0, numericOldPrice - (numericOldPrice * numericDiscount) / 100) : 0;

        // Handle slug
        let slug = undefined;
        if (name) {
            slug = slugify(name, {
                lower: true,
                strict: true,
                locale: 'vi',
            });
            // Kiểm tra trùng slug nhưng loại trừ sản phẩm hiện tại
            // Nếu update sản phẩm giữ nguyên name → slug giữ nguyên, không báo lỗi.
            // Nếu đổi sang name mới mà trùng với sản phẩm khác → báo "Tên sản phẩm đã tồn tại".
            // Nếu đổi sang name mới khác → generate slug mới và update DB.

            const existingSlug = await ProductModel.findOne({
                slug,
                // _id: { $ne: req.params.id },
                ...normalizeProductsExceptId(req.params.id, true), // true = exclude
            });
            console.log({ existingSlug });
            if (existingSlug) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên sản phẩm đã tồn tại',
                });
            }
        }

        // --- Slug cho category / subCategory / thirdSubCategory ---
        const categorySlug = categoryName ? slugify(categoryName, { lower: true, locale: 'vi', strict: true }) : '';
        const subCategorySlug = subCategoryName
            ? slugify(subCategoryName, { lower: true, locale: 'vi', strict: true })
            : '';
        const thirdSubCategorySlug = thirdSubCategoryName
            ? slugify(thirdSubCategoryName, { lower: true, locale: 'vi', strict: true })
            : '';

        const updateData = {
            name,
            description,
            brand,
            price: numericPrice || 0,
            oldPrice: numericOldPrice || 0,
            categoryName,
            categoryId,
            category,
            subCategoryId,
            subCategoryName,
            thirdSubCategoryId,
            thirdSubCategoryName,
            categorySlug,
            subCategorySlug,
            thirdSubCategorySlug,
            countInStock: countInStock || 0,
            rating,
            isFeatured,
            isPublished,
            discount: numericDiscount || 0,
            productRam,
            productSize,
            productWeight,
        };
        if (slug) {
            // updateData.slug = slug;
            updateData.slug = updateProductSlug(name, req.params.id);
        }

        const query = normalizeProductId(req.params.id);
        const product = await ProductModel.findOneAndUpdate(query, updateData, { new: true });
        if (!product) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        // Handle images
        let deletedImages = [];
        try {
            const raw = req.body.deletedImages;
            deletedImages = Array.isArray(raw) ? raw : typeof raw === 'string' ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('Không thể parse deletedImages:', e);
            deletedImages = [];
        }

        // --- Xoá ảnh cũ nếu có deletedImages ---
        if (deletedImages.length > 0) {
            product.images = product.images.filter((img) => !deletedImages.includes(img));

            await Promise.all(
                deletedImages.map(async (url) => {
                    try {
                        const urlArr = url.split('/');
                        const imageWithExt = urlArr[urlArr.length - 1];
                        const publicId = imageWithExt.split('.')[0];
                        if (publicId) {
                            await cloudinary.uploader.destroy(publicId);
                        }
                    } catch (err) {
                        console.warn(`Không thể xoá ảnh Cloudinary: ${url}`, err);
                    }
                })
            );
        }

        let imageUrls = [];

        if (req.files && req.files.length > 0) {
            imageUrls = await Promise.all(
                req.files.map(async (img) => {
                    const uploadedImage = await cloudinary.uploader.upload(img.path);
                    return uploadedImage.url;
                })
            );
        }
        product.images = [...product.images, ...imageUrls];

        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật sản phẩm thành công',
            updatedProduct: product,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const updateProductRam = async (req, res) => {
    try {
        const productRam = await ProductRamModel.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
            },
            { new: true }
        );

        if (!productRam) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        await productRam.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật RAM sản phẩm thành công',
            updatedProductRam: productRam,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const updateProductWeight = async (req, res) => {
    try {
        const productWeight = await ProductWeightModel.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
            },
            { new: true }
        );

        if (!productWeight) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        await productWeight.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật cân nặng sản phẩm thành công',
            updatedProductWeight: productWeight,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const updateProductSize = async (req, res) => {
    try {
        const productSize = await ProductSizeModel.findByIdAndUpdate(
            req.params.id,
            {
                name: req.body.name,
            },
            { new: true }
        );

        if (!productSize) {
            return res.status(400).json({
                success: false,
                message: 'Không tìm thấy sản phẩm',
            });
        }

        await productSize.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật size sản phẩm thành công',
            updatedProductSize: productSize,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const filterProducts = async (req, res) => {
    const {
        categoryId,
        subCategoryId,
        thirdSubCategoryId,
        slug,
        minPrice,
        maxPrice,
        productSize,
        rating,
        page = 1,
        limit = process.env.LIMIT_PRODUCTS,
        keyword,
        stockStatus,
        sortBy = 'name',
        order = 'asc',
    } = req.body;

    const filters = {};
    let searchLevel = null;

    if (categoryId?.length) {
        filters.categoryId = { $in: categoryId };
    }
    if (subCategoryId?.length) {
        filters.subCategoryId = { $in: subCategoryId };
    }
    if (thirdSubCategoryId?.length) {
        filters.thirdSubCategoryId = { $in: thirdSubCategoryId };
    }

    // Slug
    if (slug) {
        // 1. Check third
        const existThird = await ProductModel.exists({ thirdSubCategorySlug: slug });
        if (existThird) {
            filters.thirdSubCategorySlug = slug;
            searchLevel = 'thirdSubCategory';
        } else {
            // 2. Check sub
            const existSub = await ProductModel.exists({ subCategorySlug: slug });
            if (existSub) {
                filters.subCategorySlug = slug;
                searchLevel = 'subCategory';
            } else {
                // 3. Check category
                const category = await CategoryModel.findOne({ slug });
                if (!category) {
                    return res.status(404).json({
                        success: false,
                        message: 'Không tìm thấy danh mục',
                    });
                }

                // lấy toàn bộ slug con cháu
                const collectSlugs = async (slug) => {
                    const slugs = [slug];
                    const children = await CategoryModel.find({ parentCategorySlug: slug }).select('slug');
                    for (let child of children) {
                        const subSlugs = await collectSlugs(child.slug);
                        slugs.push(...subSlugs);
                    }
                    return slugs;
                };
                const allSlugs = await collectSlugs(slug);

                filters.$or = [
                    { categorySlug: { $in: allSlugs } },
                    { subCategorySlug: { $in: allSlugs } },
                    { thirdSubCategorySlug: { $in: allSlugs } },
                ];
                searchLevel = 'category';
            }
        }
    }

    if (minPrice || maxPrice) {
        filters.price = {
            $gte: +minPrice || 0,
            $lte: +maxPrice || Infinity,
        };
    }
    if (productSize?.length) {
        filters.productSize = { $in: productSize };
    }
    if (rating?.length) {
        filters.rating = { $in: rating };
    }

    if (stockStatus === 'available') {
        filters.countInStock = { $gt: 0 };
    } else if (stockStatus === 'unavailable') {
        filters.countInStock = 0;
    }

    // Keyword
    if (keyword && keyword.trim() !== '') {
        const regex = new RegExp(keyword.trim(), 'i'); // không phân biệt hoa thường
        filters.$or = [
            { name: { $regex: regex } },
            // { description: { $regex: regex } },
            { categoryName: { $regex: regex } },
            { subCategoryName: { $regex: regex } },
            { thirdSubCategoryName: { $regex: regex } },
        ];
    }

    try {
        // Sort option
        let sortOption = { [sortBy]: order === 'asc' ? 1 : -1 };
        if (sortBy === 'isFeatured') {
            sortOption = { isFeatured: -1, createdAt: -1 };
        }

        // ✅ Tạo cache key duy nhất từ filter
        const cacheKey =
            `products` +
            (slug ? `:slug=${slug}` : '') +
            (categoryId?.length ? `:cat=${categoryId.join(',')}` : '') +
            (subCategoryId?.length ? `:sub=${subCategoryId.join(',')}` : '') +
            (thirdSubCategoryId?.length ? `:third=${thirdSubCategoryId.join(',')}` : '') +
            (minPrice ? `:min=${minPrice}` : '') +
            (maxPrice ? `:max=${maxPrice}` : '') +
            (productSize?.length ? `:productSize=${productSize.join(',')}` : '') +
            (rating?.length ? `:rating=${rating.join(',')}` : '') +
            (keyword ? `:kw=${keyword}` : '') +
            (stockStatus ? `:stock=${stockStatus}` : '') +
            `:sort=${sortBy}:${order}` + // thêm sort
            `:page=${page || 1}:limit=${limit || process.env.LIMIT_PRODUCTS}`;

        // ✅ Check cache
        const cachedData = await redisConfig.get(cacheKey);
        if (cachedData) {
            console.log('Lấy filter products từ cache');
            return res.status(200).json(JSON.parse(cachedData));
        }

        // ✅ Nếu chưa có cache thì query DB
        console.log('Lấy filter products từ DB');
        const products = await ProductModel.find(filters)
            .populate('category')
            .sort(sortOption) // ✅ thêm sort
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        const total = await ProductModel.countDocuments(filters);

        const response = {
            success: true,
            products,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            searchLevel,
        };

        // ✅ Lưu vào cache (TTL 60 giây)
        await redisConfig.setEx(cacheKey, 60, JSON.stringify(response));

        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

// const sortByCriteria = (products, sortBy, order) => {
//     if (!Array.isArray(products)) {
//         console.error('Products is not an array:', products);
//         return [];
//     }
//     return products.sort((a, b) => {
//         if (sortBy === 'name') {
//             return order === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
//         }
//         if (sortBy === 'price') {
//             return order === 'asc' ? a.price - b.price : b.price - a.price;
//         }
//         return 0;
//     });
// };

// const sortProducts = async (req, res) => {
//     try {
//         const { products, sortBy, order } = req.body;
//         const sortedProducts = sortByCriteria([...products], sortBy, order);

//         return res.status(200).json({
//             success: true,
//             products: sortedProducts,
//             page: 0,
//             totalPages: 0,
//         });
//     } catch (error) {
//         return res.status(500).json({
//             message: error.message || error,
//             success: false,
//         });
//     }
// };

const sortProducts = async (req, res) => {
    try {
        const { sortBy = 'name', order = 'asc', page = 1, limit = 20 } = req.body;

        const sortOption = {};
        sortOption[sortBy] = order === 'asc' ? 1 : -1;

        const products = await ProductModel.find()
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await ProductModel.countDocuments();

        return res.status(200).json({
            success: true,
            products,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const searchProducts = async (req, res) => {
    try {
        let { query } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Thiếu từ khóa tìm kiếm' });
        }

        query = query.trim(); // ✅ Trim whitespace
        if (query === '') {
            return res.status(400).json({ success: false, message: 'Thiếu từ khóa tìm kiếm' });
        }

        const cachedSearchProducts = await redisConfig.get(`search:${query}`);
        if (cachedSearchProducts) {
            console.log('📌 Lấy search product từ cache:', query);
            return res.status(200).json({
                success: true,
                products: JSON.parse(cachedSearchProducts),
            });
        }

        // Regex tìm name hoặc description chứa từ khóa (không phân biệt hoa thường)
        const regex = new RegExp(query, 'i');

        const products = await ProductModel.find({
            $or: [
                { name: { $regex: regex } },
                // { description: { $regex: regex } },
                // { categoryName: { $regex: regex } },
                // { subCategoryName: { $regex: regex } },
                // { thirdSubCategoryName: { $regex: regex } },
                // { brand: { $regex: regex } },
            ],
        });
        redisConfig.setex(`search:${query}`, process.env.DEFAULT_EXPIRATION, JSON.stringify(products));

        console.log('📌 Lấy search product từ DB:', query);

        return res.status(200).json({
            success: true,
            products,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message || error,
            success: false,
        });
    }
};

const searchProductResults = async (req, res) => {
    let { keyword } = req.query;
    if (!keyword) {
        return res.status(400).json({ success: false, message: 'Thiếu từ khóa tìm kiếm' });
    }

    keyword = keyword.trim(); // ✅ Trim whitespace
    if (keyword === '') {
        return res.status(400).json({ success: false, message: 'Thiếu từ khóa tìm kiếm' });
    }
    try {
        const cachedSearchProducts = await redisConfig.get(`search:${keyword}`);
        if (cachedSearchProducts) {
            console.log('📌 Lấy search product results từ cache:', keyword);
            return res.status(200).json({
                success: true,
                products: JSON.parse(cachedSearchProducts),
            });
        }

        const regex = new RegExp(keyword, 'i'); // không phân biệt hoa thường
        const products = await ProductModel.find({
            $or: [{ name: { $regex: regex } }],
        });

        // Save vào cache
        redisConfig.setex(`search:${keyword}`, process.env.DEFAULT_EXPIRATION, JSON.stringify(products));

        console.log('📌 Lấy search product results từ DB:', keyword);

        res.status(200).json({
            success: true,
            products,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
};

const saveSearchHistory = async (req, res) => {
    try {
        const userId = req.user._id; // Lấy từ middleware verifyToken
        const { keyword } = req.body;

        if (!keyword || keyword.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa không hợp lệ',
            });
        }

        // Cập nhật searchHistory (thêm đầu mảng, không trùng nhau)
        const user = await UserModel.findById(userId);

        // Nếu đã tồn tại thì xóa để đưa lên đầu
        user.searchHistory = user.searchHistory.filter((item) => item !== keyword.trim());
        user.searchHistory.unshift(keyword.trim());

        // Giới hạn lịch sử tìm kiếm tối đa 10 mục
        user.searchHistory = user.searchHistory.slice(0, 10);

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Lưu từ khóa thành công',
            searchHistory: user.searchHistory,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message || error,
        });
    }
};

const getSearchProductsHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        }

        return res.status(200).json({
            success: true,
            history: user.searchHistory.slice(0, 10),
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Lỗi server' });
    }
};

export {
    createProduct,
    createProductSize,
    getProductsAdmin,
    getProductsUser,
    getProductsSize,
    getProductsByCategorySlug,
    getProductsByCategoryId,
    getProductsByCategoryName,
    getProductsBySubCategoryId,
    getProductsBySubCategoryName,
    getProductsByThirdSubCategoryId,
    getProductsByThirdSubCategoryName,
    getProductsByPrice,
    getProductsByRating,
    getProductsCount,
    getLatestProducts,
    deleteProduct,
    deleteMultipleProduct,
    deleteProductRam,
    deleteMultipleProductRam,
    deleteProductWeight,
    deleteMultipleProductWeight,
    deleteProductSize,
    deleteMultipleProductSize,
    getDetailsProductFromAdmin,
    getDetailsProductFromUser,
    getDetailsProductFromUserBySlug,
    removeImageFromCloudinary,
    updateProduct,
    updateProductRam,
    updateProductWeight,
    updateProductSize,
    filterProducts,
    sortProducts,
    searchProducts,
    saveSearchHistory,
    getSearchProductsHistory,
    searchProductResults,
};
