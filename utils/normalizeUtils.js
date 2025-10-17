import mongoose from 'mongoose';

export function normalizeProductId(id) {
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { _id: id }; // _id do Mongo tự sinh
    }
    return { productId: id }; // id crawl từ nguồn khác
}

export function normalizeUserId(id) {
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { _id: id }; // _id do Mongo tự sinh
    }
    return { userId: id }; // id crawl từ nguồn khác
}

export function normalizeReviewId(id) {
    if (mongoose.Types.ObjectId.isValid(id)) {
        return { _id: id }; // _id do Mongo tự sinh
    }
    return { reviewId: id }; // id crawl từ nguồn khác
}

export function normalizeProductsExceptId(id, exclude = false) {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(id);

    if (exclude) {
        return isValidObjectId ? { _id: { $ne: new mongoose.Types.ObjectId(id) } } : { productId: { $ne: id } };
    } else {
        return isValidObjectId ? { _id: new mongoose.Types.ObjectId(id) } : { productId: id };
    }
}
