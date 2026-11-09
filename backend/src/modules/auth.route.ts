import { IUser } from "../types/auth";
import express, { Request, Response } from "express";
import { getDB } from "../config/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { createAuthToken } from "../utils/auth-token";
import { sendMail } from "../utils/send-mail";

const AuthRouter = express.Router();

AuthRouter.post('/register', async(req: Request, res: Response) => {
    try{
        const db = getDB();
        const  { name, email, password } = req.body;
        const errors: Record<string, string> = {};
        let new_user: IUser = {
            name : name, 
            email: email, 
            created_at: new Date()
        }

        // name validation
        if(name){
            if(typeof name !== "string") errors.name= "Name must be a string";
            if(name.includes("@")) errors.name = "Name cannot contain @";
            const available_name = await db.collection('users').findOne({name: name});
            if(available_name) errors.name = "Name already use";
        }else{
            errors.name = "Name is required";
        }

        // email validation
        if(email){
            const email_regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
            if(!email_regex.test(email)) errors.email = "Email is invalid";
            const available_email = await db.collection('users').findOne({email: email});
            if(available_email) errors.email = "Email already use";
        }else{
            errors.email = "Email is required";
        }

        // password validation
        if(password){
            if(typeof password != "string") errors.password = "Password must be a string";
            if(password.length < 6) errors.password = "Password must be at least 6 characters";
        }else{
            errors.password = "Password is required";
        }   

        if(Object.keys(errors).length > 0){
            return res.status(400).json({
                status: "fail",
                message: "Invalid user input",
                errors: errors  
            })
        }

        const hashedPassword = await hashPassword(password);
        new_user.password = hashedPassword;

        const create_user = await db.collection('users').insertOne(new_user);
        new_user._id = create_user.insertedId;
        delete new_user.password;

        return res.status(200).json({
            status: "success",
            message: "User register successfully",
            data: new_user
        });

    }catch(err: unknown){
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

AuthRouter.post('/login', async(req: Request, res: Response) => {
    try{
        const db = getDB();
        const  { identifier, password } = req.body;
        const errors: Record<string, string> = {};

        // indentifier validation
        if(identifier){
            if(typeof identifier !== "string") errors.identifier= "username or email must be a string";
        }else{
            errors.identifier = "username or email is required";
        }

        // password validation
        if(password){
            if(typeof password != "string") errors.password = "Password must be a string";
            if(password.length < 6) errors.password = "Password must be at least 6 characters";
        }else{
            errors.password = "Password is required";
        } 

        if(Object.keys(errors).length > 0){
            return res.status(400).json({
                status: "fail",
                message: "Invalid user input",
                errors: errors  
            })
        }

        let user;
        if(identifier.includes('@')){
            user = await db.collection('users').findOne({ email: identifier });
        }else{
            user = await db.collection('users').findOne({ name: identifier});
        }

        if(!user) return res.status(400).json({
                status: "failed",
                message: "Username, email or password is incorrect",
            });
        const isPassValid = await verifyPassword(password, user?.password);
        if(!isPassValid) return res.status(400).json({
                status: "failed",
                message: "Username, email or password is incorrect",
            });

        delete user?.password;
        const token = createAuthToken(user as IUser);
    
        return res.status(200).json({
            status: "success",
            message: "Login successfully",
            data: user,
            token: token
        })
    }catch(err: unknown){
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal Server Error"
        });
    }
});

AuthRouter.post('/verify/send-otp', async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email } = req.body;
        const errors: Record<string, string> = {};

        // email validation
        if (email) {
            if (typeof email !== "string") {
                errors.email = "Email must be a string";
            } else {
                const email_regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
                if (!email_regex.test(email)) errors.email = "Email is invalid";
            }
        } else {
            errors.email = "Email is required";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid user input",
                errors: errors
            });
        }

        const user = await db.collection<IUser>('users').findOne({ email: email });
        if (!user) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        if (user.email_verified_at) {
            return res.status(400).json({
                status: "fail",
                message: "Email is already verified"
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiredMinutes = 10;
        const otp_expires_at = new Date(Date.now() + expiredMinutes * 60 * 1000);

        await db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    otp: otp,
                    otp_expires_at: otp_expires_at,
                    updated_at: new Date()
                }
            }
        );

        const emailSubject = "Kode Verifikasi OTP - Flashku";
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #333; text-align: center;">Verifikasi Email Flashku</h2>
                <p>Halo <strong>${user.name}</strong>,</p>
                <p>Berikut adalah kode OTP Anda untuk memverifikasi akun:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #4F46E5; background-color: #EEF2FF; padding: 12px 24px; border-radius: 8px;">
                        ${otp}
                    </span>
                </div>
                <p style="color: #666; font-size: 14px;">Kode OTP ini berlaku selama <strong>${expiredMinutes} menit</strong>. Jangan bagikan kode ini kepada siapa pun.</p>
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
                <p style="color: #999; font-size: 12px; text-align: center;">Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.</p>
            </div>
        `;

        await sendMail(email, emailSubject, emailContent);

        return res.status(200).json({
            status: "success",
            message: "Kode OTP berhasil dikirim ke email",
            data: {
                email: email,
                otp_expires_at: otp_expires_at
            }
        });
    } catch (err: unknown) {
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal Server Error"
        });
    }
});

AuthRouter.post('/verify/confirm-otp', async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const { email, otp } = req.body;
        const otpCode = (otp ?? req.body.code)?.toString().trim();
        const errors: Record<string, string> = {};

        // email validation
        if (email) {
            if (typeof email !== "string") {
                errors.email = "Email must be a string";
            } else {
                const email_regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
                if (!email_regex.test(email)) errors.email = "Email is invalid";
            }
        } else {
            errors.email = "Email is required";
        }

        // otp validation
        if (!otpCode) {
            errors.otp = "Kode OTP is required";
        } else if (otpCode.length !== 6 || !/^\d+$/.test(otpCode)) {
            errors.otp = "Kode OTP must be a 6-digit numeric string";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid user input",
                errors: errors
            });
        }

        const user = await db.collection<IUser>('users').findOne({ email: email });
        if (!user) {
            return res.status(404).json({
                status: "fail",
                message: "User not found"
            });
        }

        if (user.email_verified_at) {
            return res.status(400).json({
                status: "fail",
                message: "Email is already verified"
            });
        }

        if (!user.otp) {
            return res.status(400).json({
                status: "fail",
                message: "Kode OTP belum diminta atau sudah kedaluwarsa"
            });
        }

        if (user.otp !== otpCode) {
            return res.status(400).json({
                status: "fail",
                message: "Kode OTP tidak valid"
            });
        }

        if (user.otp_expires_at && new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({
                status: "fail",
                message: "Kode OTP sudah kedaluwarsa"
            });
        }

        const verifiedAt = new Date();
        await db.collection('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    email_verified_at: verifiedAt,
                    updated_at: verifiedAt
                },
                $unset: {
                    otp: "",
                    otp_expires_at: ""
                }
            }
        );

        return res.status(200).json({
            status: "success",
            message: "Email berhasil diverifikasi",
            data: {
                email: user.email,
                email_verified_at: verifiedAt
            }
        });
    } catch (err: unknown) {
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal Server Error"
        });
    }
});

export default AuthRouter;