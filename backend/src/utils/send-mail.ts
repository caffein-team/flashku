import nodemailer from "nodemailer";

export async function sendMail(recipient: string, subject: string, content: string) {
    const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST as string || 'smtp.gmail.com', 
        port: Number(process.env.MAIL_PORT) || 587,
        secure: process.env.MAIL_PORT === '465',
        auth: {
            user: process.env.MAIL_USERNAME,
            pass: process.env.MAIL_PASSWORD
        }
    });

    const mailOption = {
        from: process.env.MAIL_USERNAME as string || 'dhevapkl123@gmail.com',
        to:  recipient,
        subject: subject,
        html: content  
    };

    try {
        const info = await transporter.sendMail(mailOption);
        console.log('Email sent successfully');
        console.log('Message ID:', info.messageId);
        return info;
    } catch(err: unknown) {
        console.error('Error sending email:', err);
        throw err;
    }
}
