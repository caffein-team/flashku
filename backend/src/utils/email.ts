import nodemailer from "nodemailer";

export async function sendOtpEmail(toEmail: string, otpCode: string, userName: string): Promise<boolean> {
    const host = process.env.MAIL_HOST || "smtp.gmail.com";
    const port = Number(process.env.MAIL_PORT) || 587;
    const user = process.env.MAIL_USERNAME || process.env.SMTP_USER;
    const pass = process.env.MAIL_PASSWORD || process.env.SMTP_PASSWORD;
    const fromName = process.env.SMTP_FROM_NAME || "Flashku App";
    const expireMinutes = Number(process.env.OTP_EXPIRE_MINUTES) || 10;

    if (!user || !pass) {
        console.warn(
            `[EMAIL MOCK] Mail credentials not fully configured in .env. Reset OTP for ${toEmail} (${userName}) is: >>> ${otpCode} <<<`
        );
        return false;
    }

    try {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user,
                pass,
            },
        });

        const htmlBody = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Password OTP</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #0f172a; font-size: 24px; font-weight: 700; margin: 0;">Flashku</h1>
            <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Permintaan Atur Ulang Kata Sandi</p>
        </div>
        
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
            Halo <strong>${userName}</strong>,
        </p>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
            Kami menerima permintaan untuk mereset kata sandi akun Anda. Masukkan 6-digit kode OTP berikut pada aplikasi untuk melanjutkan:
        </p>
        
        <div style="background-color: #f1f5f9; border: 2px dashed #94a3b8; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #2563eb; font-family: monospace;">${otpCode}</span>
        </div>
        
        <p style="color: #64748b; font-size: 13px; text-align: center; margin-bottom: 24px;">
            Kode ini kedaluwarsa dalam waktu <strong>${expireMinutes} menit</strong>.
        </p>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 16px;">
            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0; text-align: center;">
                Jika Anda tidak merasa meminta reset kata sandi, silakan abaikan pesan ini. Akun Anda tetap terlindungi dengan aman.
            </p>
        </div>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to: toEmail,
            subject: `Kode Verifikasi Reset Password - Flashku`,
            html: htmlBody,
        });

        console.log(`Password reset OTP sent to ${toEmail}`);
        return true;
    } catch (err) {
        console.error(`Failed to send email to ${toEmail} via SMTP:`, err);
        console.log(`[FALLBACK OTP LOG] Due to SMTP error: OTP for ${toEmail} is: >>> ${otpCode} <<<`);
        return false;
    }
}
