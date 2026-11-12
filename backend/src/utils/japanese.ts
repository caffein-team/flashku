import { IPhrase } from "../types/song";
import { runPythonScript } from "./python-runner";

function parseJsonArrayOutput(raw: string): any {
    const markerMatch = raw.match(/__JSON_START__([\s\S]*?)__JSON_END__/);
    if (markerMatch && markerMatch[1]) {
        return JSON.parse(markerMatch[1].trim());
    }

    try {
        return JSON.parse(raw.trim());
    } catch {
        const firstBracket = raw.indexOf("[");
        const lastBracket = raw.lastIndexOf("]");
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
            const candidate = raw.substring(firstBracket, lastBracket + 1);
            return JSON.parse(candidate);
        }
        throw new Error(`Invalid JSON format: ${raw}`);
    }
}

export async function tokenizeJapaneseBatch(lines: string[]): Promise<IPhrase[][]> {
    if (!lines || lines.length === 0) return [];

    const rawResult = await runPythonScript(["tokenize_batch"], JSON.stringify(lines));

    try {
        const parsed = parseJsonArrayOutput(rawResult);
        if (parsed && parsed.error) {
            throw new Error(parsed.error);
        }
        return parsed as IPhrase[][];
    } catch (err: any) {
        throw new Error(`Failed to parse Japanese tokenizer output: ${err.message || rawResult}`);
    }
}
