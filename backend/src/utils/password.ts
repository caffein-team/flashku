import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(plainTextPassword: string): Promise<string> {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashed = await bcrypt.hash(plainTextPassword, salt);
    return hashed;
}

export async function verifyPassword(
    plainTextPassword: string,
    storedHash: string
): Promise<boolean> {
    const isMatch = await bcrypt.compare(plainTextPassword, storedHash);
    return isMatch;
}