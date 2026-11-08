import { IUser } from "../types/auth";
import express, { Request, Response } from "express";
import { getDB } from "../config/db";
import { hashPassword, verifyPassword } from "../utils/password";
import { createAuthToken } from "../utils/auth-token";

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
})

export default AuthRouter;