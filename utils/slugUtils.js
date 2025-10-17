import slugify from 'slugify';

export const updateProductSlug = (name, productId) => {
    if (!name) return null;
    const nameSlug = slugify(name, { lower: true, strict: true, locale: 'vi' });
    if (!productId) return nameSlug; // fallback nếu chưa có productId
    return `${nameSlug}-p${productId.toString()}`;
};
