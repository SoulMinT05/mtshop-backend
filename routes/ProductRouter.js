import { Router } from 'express';

import {
    createProduct,
    getProductsAdmin,
    getProductsUser,
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
    getDetailsProductFromUser,
    updateProduct,
    deleteMultipleProduct,
    createProductSize,
    getProductsSize,
    deleteProductSize,
    updateProductSize,
    deleteMultipleProductSize,
    filterProducts,
    sortProducts,
    searchProducts,
    searchProductResults,
    saveSearchHistory,
    getSearchProductsHistory,
    getDetailsProductFromAdmin,
    getDetailsProductFromUserBySlug,
    getProductsByCategorySlug,
} from '../controllers/ProductController.js';
import { verifyAccessToken } from '../ middlewares/verifyToken.js';
import upload from '../ middlewares/multer.js';

const productRouter = Router();

// Home page + Chi tiết sản phẩm
productRouter.get('/all-products-category-id/:id', getProductsByCategoryId);
productRouter.get('/all-products-sub-category-id/:id', getProductsBySubCategoryId);

productRouter.get('/all-products-third-sub-category-id/:id', getProductsByThirdSubCategoryId);

productRouter.delete('/size/deleteMultipleProductSize', verifyAccessToken, deleteMultipleProductSize);
productRouter.delete('/size/:id', verifyAccessToken, deleteProductSize);
productRouter.put('/size/:id', verifyAccessToken, updateProductSize);

productRouter.post('/create', verifyAccessToken, upload.array('images'), createProduct);
productRouter.post('/create-size', verifyAccessToken, createProductSize);
productRouter.get('/all-products-admin', getProductsAdmin);
productRouter.get('/all-products-user', getProductsUser);
productRouter.get('/all-products-size', getProductsSize);

// CHƯA XÀI
productRouter.get('/all-products-category-name', getProductsByCategoryName);
productRouter.get('/all-products-sub-category-name', getProductsBySubCategoryName);
productRouter.get('/all-products-third-sub-category-name', getProductsByThirdSubCategoryName);

productRouter.get('/all-products-price', getProductsByPrice);
productRouter.get('/all-products-rating', getProductsByRating);
productRouter.get('/count', getProductsCount);
productRouter.get('/latest-products', getLatestProducts);
productRouter.post('/filter-product', filterProducts);
productRouter.post('/sort', sortProducts);
productRouter.get('/search', searchProducts);
productRouter.get('/search-results', searchProductResults);
productRouter.get('/search-product-history', verifyAccessToken, getSearchProductsHistory);
productRouter.post('/save-search-history', verifyAccessToken, saveSearchHistory);

productRouter.delete('/deleteMultipleProduct', verifyAccessToken, deleteMultipleProduct);
productRouter.get('/getDetailsProductFromAdmin/:id', getDetailsProductFromAdmin);

productRouter.get('/getDetailsProductFromUserBySlug/:slug', getDetailsProductFromUserBySlug);
productRouter.get('/getProductsByCategorySlug/:slug', getProductsByCategorySlug);

productRouter.get('/:id', getDetailsProductFromUser);
productRouter.delete('/:id', verifyAccessToken, deleteProduct);
productRouter.put('/:id', verifyAccessToken, upload.array('images'), updateProduct);

export default productRouter;
