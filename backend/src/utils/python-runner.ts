import path from "path";
import fs from "fs";
import { spawn } from "child_process";

export function getPythonPath(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
        return process.env.PYTHON_PATH;
    }
    const venvWindows = path.resolve(process.cwd(), "prototype/.venv/Scripts/python.exe");
    if (fs.existsSync(venvWindows)) {
        return venvWindows;
    }
    const venvUnix = path.resolve(process.cwd(), "prototype/.venv/bin/python");
    if (fs.existsSync(venvUnix)) {
        return venvUnix;
    }
    return "python";
}

export function runPythonScript(args: string[], stdinInput?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const pythonPath = getPythonPath();
        const scriptPath = path.resolve(process.cwd(), "src/scripts/song_helper.py");
        const proc = spawn(pythonPath, [scriptPath, ...args], {
            cwd: process.cwd()
        });

        let stdoutData = "";
        let stderrData = "";

        proc.stdout.on("data", (chunk) => {
            stdoutData += chunk.toString("utf-8");
        });

        proc.stderr.on("data", (chunk) => {
            stderrData += chunk.toString("utf-8");
        });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve(stdoutData.trim());
            } else {
                reject(new Error(stderrData.trim() || `Python process exited with code ${code}`));
            }
        });

        proc.on("error", (err) => {
            reject(err);
        });

        if (stdinInput !== undefined) {
            proc.stdin.write(stdinInput, "utf-8");
            proc.stdin.end();
        }
    });
}
