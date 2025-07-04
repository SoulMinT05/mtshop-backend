import userRouter from './UserRouter.js';
import categoryRouter from './CategoryRouter.js';
import productRouter from './ProductRouter.js';
import staffRouter from './StaffRouter.js';
import homeSlideRouter from './HomeSlideRouter.js';
import bannerRouter from './BannerRouter.js';
import blogRouter from './BlogRouter.js';
import voucherRouter from './VoucherRouter.js';
import checkoutTokenRouter from './CheckoutTokenRouter.js';
import orderRouter from './OrderRouter.js';

const route = (app) => {
    app.use('/api/user', userRouter);
    app.use('/api/category', categoryRouter);
    app.use('/api/product', productRouter);
    app.use('/api/staff', staffRouter);
    app.use('/api/homeSlide', homeSlideRouter);
    app.use('/api/banner', bannerRouter);
    app.use('/api/blog', blogRouter);
    app.use('/api/voucher', voucherRouter);
    app.use('/api/checkoutToken', checkoutTokenRouter);
    app.use('/api/order', orderRouter);
};

export default route;
