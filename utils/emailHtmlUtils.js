export const verifyEmailHtml = (name, message, otp) => {
    return `
        <!DOCTYPE html>
        <html lang='en'>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width", initial-scale=1.0>
            <title>Xác minh email</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    background-color: #f4f4f4;
                    color: #333;
                }
                .container {
                    max-width: 600px;
                    margin: 20px auto;
                    background: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }
                .header h1 {
                    color: #ff5252;
                }
                .content {
                    text-align: center;
                }
                .content p {
                    font-size: 16px;
                    line-height: 1.5;
                }
                .otp {
                    font-size: 20px;
                    font-weight: bold;
                    color: #4CAF50;
                    margin: 20px 0;
                }
                .footer {
                    text-align: center;
                    font-size: 14px;
                    color: #777;
                    margin-top: 20px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Xác minh email</h1>
                </div>
                <div class="content">
                    <p>
                        Chào ${name}
                    </p>
                    <p>Cảm ơn bạn đã ${message} tại RubyStore.</p>
                    <p>Vui lòng sử dụng mã OTP bên dưới và xác minh địa chỉ email của bạn.</p>
                    <div class="otp">${otp}</div>
                    <p>Mã OTP có hiệu lực trong <strong>${process.env.OTP_EXPIRATION} phút</strong>.</p>
                    <p>
                        Nếu bạn không phải là người thực hiện hành động, vui lòng bỏ qua email này.
                    </p>
                    <p style="font-style: italic; color: #6B7280; font-size: 15px;">
                        Nếu mã OTP hết hạn hay có vấn đề lỗi xảy ra, vui lòng thực hiện đăng ký lại!
                    </p>
                </div>
                <div class="footer">
                    <p>&copy; 2025 RubyStore. </p>
                </div>
            </div>
        </body>
    </html>
`;
};

export const createOrderEmailHtml = async (user, order) => {
    const formattedDate = new Date(order.createdAt).toLocaleDateString('vi-VN');
    const productRowsHtml = order.selectedCartItems
        .map(
            (item) => `
        <tr>
            <td style="text-align: center;"><img src="${item.images[0]}" alt="${item.name}" width="80" /></td>
            <td style="text-align: center;">${item.name}</td>
            <td style="text-align: center;">${item.sizeProduct}</td>
            <td style="text-align: center;">${item.price.toLocaleString()} VND</td>
            <td style="text-align: center;">${item.quantityProduct}</td>
            <td style="text-align: center;">${(item.price * item.quantityProduct).toLocaleString()} VND</td>
        </tr>
    `
        )
        .join('');

    return `
        <h2>Xin chào ${user.name},</h2>
        <p>Bạn đã đặt hàng thành công tại <strong>RubyStore</strong>. Dưới đây là thông tin đơn hàng:</p>

        <table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
            <thead>
                <tr>
                    <th>Hình ảnh</th>
                    <th>Tên sản phẩm</th>
                    <th>Size</th>
                    <th>Đơn giá</th>
                    <th>Số lượng</th>
                    <th>Tổng tiền</th>
                </tr>
            </thead>
            <tbody>
                ${productRowsHtml}
            </tbody>
        </table>

        <p><strong>Ngày đặt hàng:</strong> ${formattedDate}</p>
        <p><strong>Ghi chú từ khách hàng:</strong> ${order.note ? order.note : 'Không có'}</p>
        <p><strong>Tổng số lượng:</strong> ${order.totalQuantity}</p>
        <p><strong>Tổng tiền:</strong> ${order.totalPrice.toLocaleString()} VND</p>
        <p><strong>Voucher:</strong> ${
            order.discountType
                ? order.discountType === 'percent'
                    ? `${order.discountValue}%`
                    : `${order.discountValue.toLocaleString()} VND`
                : 'Không áp dụng'
        }</p>
        <p><strong>Phí vận chuyển:</strong> ${order.shippingFee.toLocaleString()} VND</p>
        <p>
            <strong>Thành tiền:</strong> 
            <span style="color: #ff5252;">${order.finalPrice.toLocaleString()} VND</span>
        </p>
        <p>
            <strong>Phương thức thanh toán:</strong> 
            <span style="color: #ff5252;">${order.paymentMethod.toUpperCase()}</span>
        </p>
        <p>
            <strong>Trạng thái thanh toán: </strong>
            <span style="color: #0055aa;">
                ${order.paymentStatus === 'unpaid' ? 'Chưa thanh toán' : 'Đã thanh toán'}
            </span>
        </p>
        <p>
            <strong>Trạng thái đơn hàng: </strong>
            <span style="color: #0055aa;">
                ${order.orderStatus === 'pending' ? 'Đang xử lý' : 'Đã xử lý'}
            </span>
        </p>
        <p><strong>Địa chỉ giao hàng: </strong> Đường ${order.shippingAddress.streetLine}, Phường ${
        order.shippingAddress.ward
    }, Quận ${order.shippingAddress.district}, Thành phố ${order.shippingAddress.city}</p>
        
        <br/>
        <p><i>Khi nào đơn hàng được giao, bạn sẽ nhận thêm một mail xác nhận nữa.</i></p>
        <p><i>Cảm ơn bạn đã tin tưởng và mua sắm tại RubyStore!</i></p>
    `;
};
