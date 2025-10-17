import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    service: 'gmail',
    port: 465,
    secure: true, // true for port 465, false for other ports
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

export const sendEmail = async (to, subject, text, html) => {
    try {
        const info = await transporter.sendMail({
            // from: process.env.EMAIL, // sender address
            from: '"RubyStore" <no-reply@rubystore.com>',
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });
        return {
            success: true,
            messageId: info.messageId,
        };
    } catch (error) {
        console.error('Lỗi gửi email: ', error);
        return {
            success: false,
            error: error.message,
        };
    }
};

export const sendAccountConfirmationEmail = async (to, subject, text, html) => {
    const result = await sendEmail(to, subject, text, html);
    if (result.success) {
        return true;
    } else {
        return false;
    }
};
