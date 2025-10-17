import { Router } from 'express';

import {
    register,
    verifyEmail,
    login,
    logout,
    uploadAvatar,
    removeImageFromCloudinary,
    updateInfoUser,
    forgotPassword,
    verifyForgotPasswordOtp,
    resetPassword,
    refreshToken,
    getUserDetails,
    // CART
    addToCart,
    decreaseQuantityCart,
    removeProductCart,
    getCart,
    // WISHLIST
    addToWishlist,
    removeFromWishlist,
    getAllWishlists,
    checkLogin,
    checkIsRefreshToken,
    changePassword,
    updateAddress,
    authWithGoogle,
    authWithFacebook,
    getDetailsReview,
    addReview,
    getReviews,
    updateCartItemSize,
    deleteMultipleCartItems,
    updateQuantityItemsCart,
    getUsersFromAdmin,
    deleteUserFromAdmin,
    deleteMultipleUsersFromAdmin,
    getUserDetailsFromAdmin,
    toggleUserLockStatus,
    updateUserInfoFromAdmin,
    addUserFromAdmin,
    addReplyToReview,
    deleteReview,
    deleteReplyFromReview,
    deleteMultipleReviewsFromAdmin,
    deleteReviewFromAdmin,
    getReviewsBySlugProduct,
} from '../controllers/UserController.js';
import { verifyAccessToken } from '../ middlewares/verifyToken.js';
import upload from '../ middlewares/multer.js';

const userRouter = Router();

// REVIEW
// userRouter.delete('/deleteReplyFromReview/:reviewId/:replyId', verifyAccessToken, deleteReplyFromReview);
userRouter.post('/addReplyToReview/:reviewId', verifyAccessToken, addReplyToReview);
userRouter.delete('/deleteReview/:reviewId', verifyAccessToken, deleteReview);

userRouter.get('/reviews/getReviewsBySlugProduct/:slug', getReviewsBySlugProduct);
userRouter.post('/addReview', verifyAccessToken, addReview);
userRouter.get('/all-reviews', getReviews);

// USER
userRouter.post('/register', register);
userRouter.post('/verify-email', verifyEmail);
userRouter.post('/login', login);
userRouter.post('/auth-google', authWithGoogle);
userRouter.post('/auth-facebook', authWithFacebook);
userRouter.post('/logout', verifyAccessToken, logout);
userRouter.put('/avatar', verifyAccessToken, upload.single('avatar'), uploadAvatar);
userRouter.delete('/delete-image', verifyAccessToken, removeImageFromCloudinary);
userRouter.put('/update-info', verifyAccessToken, updateInfoUser);
userRouter.post('/forgot-password', forgotPassword);
userRouter.post('/verify-forgot-password', verifyForgotPasswordOtp);
userRouter.post('/reset-password', resetPassword);
userRouter.post('/change-password', verifyAccessToken, changePassword);
userRouter.get('/refreshToken', refreshToken);
userRouter.get('/user-details', verifyAccessToken, getUserDetails);
userRouter.get('/check-login', checkLogin);
userRouter.get('/checkIsRefreshToken', checkIsRefreshToken);

// CART
userRouter.post('/updateCartItemSize', verifyAccessToken, updateCartItemSize);
userRouter.post('/updateQuantityItemsCart', verifyAccessToken, updateQuantityItemsCart);
userRouter.post('/addToCart', verifyAccessToken, addToCart);
userRouter.post('/decreaseQuantityCart', verifyAccessToken, decreaseQuantityCart);
userRouter.post('/removeProductCart', verifyAccessToken, removeProductCart);
userRouter.post('/deleteMultipleCartItems', verifyAccessToken, deleteMultipleCartItems);
userRouter.get('/cart', verifyAccessToken, getCart);

// WISHLIST
userRouter.delete('/removeFromWishlist/:productId', verifyAccessToken, removeFromWishlist);
userRouter.post('/addToWishlist', verifyAccessToken, addToWishlist);
userRouter.get('/getAllWishlists', verifyAccessToken, getAllWishlists);

// ADDRESS
userRouter.put('/update-address', verifyAccessToken, updateAddress);

// FOR ADMIN
userRouter.delete('/deleteReviewFromAdmin/:reviewId', verifyAccessToken, deleteReviewFromAdmin);
userRouter.delete('/deleteUserFromAdmin/:userId', verifyAccessToken, deleteUserFromAdmin);
userRouter.patch(
    '/updateUserInfoFromAdmin/:userId',
    upload.single('avatar'),
    verifyAccessToken,
    updateUserInfoFromAdmin
);
userRouter.patch('/toggleUserLockStatus/:userId', verifyAccessToken, toggleUserLockStatus);
userRouter.get('/userDetailsFromAdmin/:userId', verifyAccessToken, getUserDetailsFromAdmin);

userRouter.delete('/deleteMultipleUsersFromAdmin', verifyAccessToken, deleteMultipleUsersFromAdmin);
userRouter.delete('/deleteMultipleReviewsFromAdmin', verifyAccessToken, deleteMultipleReviewsFromAdmin);
userRouter.post('/addUserFromAdmin', upload.single('avatar'), verifyAccessToken, addUserFromAdmin);
userRouter.get('/usersFromAdmin', verifyAccessToken, getUsersFromAdmin);

export default userRouter;
