#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Comprehensive error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
// Suppress all Node.js warnings (including deprecation)
process.emitWarning = () => { };
console.log('Starting OpenAI GPT Image MCP Server...');
console.log('Node.js version:', process.version);
console.log('Environment variables check:');
console.log('- AZURE_OPENAI_API_KEY:', process.env.AZURE_OPENAI_API_KEY ? 'SET' : 'NOT SET');
console.log('- AZURE_OPENAI_ENDPOINT:', process.env.AZURE_OPENAI_ENDPOINT ? 'SET' : 'NOT SET');
console.log('- OPENAI_API_VERSION:', process.env.OPENAI_API_VERSION ? 'SET' : 'NOT SET');
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const openai_1 = require("openai");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Function to load environment variables from a file
const loadEnvFile = (filePath) => {
    try {
        const envConfig = fs_1.default.readFileSync(filePath, "utf8");
        envConfig.split("\n").forEach((line) => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith("#")) {
                const [key, ...valueParts] = trimmedLine.split("=");
                const value = valueParts.join("=").trim();
                if (key) {
                    // Remove surrounding quotes if present
                    process.env[key.trim()] = value.startsWith("'") && value.endsWith("'") || value.startsWith("\"") && value.endsWith("\"")
                        ? value.slice(1, -1)
                        : value;
                }
            }
        });
        console.log(`Loaded environment variables from ${filePath}`);
    }
    catch (error) {
        console.warn(`Warning: Could not read environment file at ${filePath}:`, error);
    }
};
// Parse command line arguments for --env-file
const cmdArgs = process.argv.slice(2);
const envFileArgIndex = cmdArgs.findIndex(arg => arg === "--env-file");
if (envFileArgIndex !== -1 && cmdArgs[envFileArgIndex + 1]) {
    console.log("Loading environment variables from file:", cmdArgs[envFileArgIndex + 1]);
    const envFilePath = cmdArgs[envFileArgIndex + 1];
    loadEnvFile(envFilePath);
}
else {
    console.log("No environment file provided");
}
console.log('Initializing MCP Server...');
(async () => {
    try {
        const server = new mcp_js_1.McpServer({
            name: "openai-gpt-image-mcp",
            version: "1.0.0"
        }, {
            capabilities: {
                tools: { listChanged: false }
            }
        });
        console.log('MCP Server created, setting up tools...');
        // Zod schema for create-image tool input
        const createImageSchema = zod_1.z.object({
            prompt: zod_1.z.string().max(32000),
            background: zod_1.z.enum(["transparent", "opaque", "auto"]).optional(),
            model: zod_1.z.literal("gpt-image-1").default("gpt-image-1"),
            moderation: zod_1.z.enum(["auto", "low"]).optional(),
            n: zod_1.z.number().int().min(1).max(10).optional(),
            output_compression: zod_1.z.number().int().min(0).max(100).optional(),
            output_format: zod_1.z.enum(["png", "jpeg", "webp"]).optional(),
            quality: zod_1.z.enum(["auto", "high", "medium", "low"]).optional(),
            size: zod_1.z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional(),
            user: zod_1.z.string().optional(),
            output: zod_1.z.enum(["base64", "file_output"]).default("base64"),
            file_output: zod_1.z.string().optional().refine((val) => {
                if (!val)
                    return true;
                // Check for Unix/Linux/macOS absolute paths
                if (val.startsWith("/"))
                    return true;
                // Check for Windows absolute paths (C:/, D:\, etc.)
                if (/^[a-zA-Z]:[/\\]/.test(val))
                    return true;
                return false;
            }, { message: "file_output must be an absolute path" }).describe("Absolute path to save the image file, including the desired file extension (e.g., /path/to/image.png). If multiple images are generated (n > 1), an index will be appended (e.g., /path/to/image_1.png)."),
        }).refine((data) => {
            if (data.output !== "file_output")
                return true;
            if (typeof data.file_output !== "string")
                return false;
            // Check for Unix/Linux/macOS absolute paths
            if (data.file_output.startsWith("/"))
                return true;
            // Check for Windows absolute paths (C:/, D:\, etc.)
            if (/^[a-zA-Z]:[/\\]/.test(data.file_output))
                return true;
            return false;
        }, { message: "file_output must be an absolute path when output is 'file_output'", path: ["file_output"] });
        // Use ._def.schema.shape to get the raw shape for server.tool due to Zod refinements
        server.tool("create-image", createImageSchema._def.schema.shape, async (args, _extra) => {
            console.log('create-image tool called with args:', JSON.stringify(args, null, 2));
            // If AZURE_OPENAI_API_KEY is defined, use the AzureOpenAI class
            const openai = process.env.AZURE_OPENAI_API_KEY ? new openai_1.AzureOpenAI() : new openai_1.OpenAI();
            // Only allow gpt-image-1
            const { prompt, background, model = "gpt-image-1", moderation, n, output_compression, output_format, quality, size, user, output = "base64", file_output: file_outputRaw, } = args;
            const file_output = file_outputRaw;
            // Enforce: if background is 'transparent', output_format must be 'png' or 'webp'
            if (background === "transparent" && output_format && !["png", "webp"].includes(output_format)) {
                throw new Error("If background is 'transparent', output_format must be 'png' or 'webp'");
            }
            // Only include output_compression if output_format is webp or jpeg
            const imageParams = {
                prompt,
                model,
                ...(background ? { background } : {}),
                ...(moderation ? { moderation } : {}),
                ...(n ? { n } : {}),
                ...(output_format ? { output_format } : {}),
                ...(quality ? { quality } : {}),
                ...(size ? { size } : {}),
                ...(user ? { user } : {}),
            };
            if (typeof output_compression !== "undefined" &&
                output_format &&
                ["webp", "jpeg"].includes(output_format)) {
                imageParams.output_compression = output_compression;
            }
            console.log('Calling OpenAI API with params:', JSON.stringify(imageParams, null, 2));
            const result = await openai.images.generate(imageParams);
            // gpt-image-1 always returns base64 images in data[].b64_json
            const images = (result.data ?? []).map((img) => ({
                b64: img.b64_json,
                mimeType: output_format === "jpeg" ? "image/jpeg" : output_format === "webp" ? "image/webp" : "image/png",
                ext: output_format === "jpeg" ? "jpg" : output_format === "webp" ? "webp" : "png",
            }));
            // Auto-switch to file_output if total base64 size exceeds 1MB
            const MAX_RESPONSE_SIZE = 1048576; // 1MB
            const totalBase64Size = images.reduce((sum, img) => sum + Buffer.byteLength(img.b64, "base64"), 0);
            let effectiveOutput = output;
            let effectiveFileOutput = file_output;
            if (output === "base64" && totalBase64Size > MAX_RESPONSE_SIZE) {
                effectiveOutput = "file_output";
                if (!file_output) {
                    // Use /tmp or MCP_HF_WORK_DIR if set
                    const tmpDir = process.env.MCP_HF_WORK_DIR || "/tmp";
                    const unique = Date.now();
                    effectiveFileOutput = path_1.default.join(tmpDir, `openai_image_${unique}.${images[0]?.ext ?? "png"}`);
                }
            }
            if (effectiveOutput === "file_output") {
                const fs = await Promise.resolve().then(() => __importStar(require("fs/promises")));
                const path = await Promise.resolve().then(() => __importStar(require("path")));
                // If multiple images, append index to filename
                const basePath = effectiveFileOutput;
                const responses = [];
                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    let filePath = basePath;
                    if (images.length > 1) {
                        const parsed = path.parse(basePath);
                        filePath = path.join(parsed.dir, `${parsed.name}_${i + 1}.${img.ext ?? "png"}`);
                    }
                    else {
                        // Ensure correct extension
                        const parsed = path.parse(basePath);
                        filePath = path.join(parsed.dir, `${parsed.name}.${img.ext ?? "png"}`);
                    }
                    await fs.writeFile(filePath, Buffer.from(img.b64, "base64"));
                    responses.push({ type: "text", text: `Image saved to: file://${filePath}` });
                }
                return { content: responses };
            }
            else {
                // Default: base64
                return {
                    content: images.map((img) => ({
                        type: "image",
                        data: img.b64,
                        mimeType: img.mimeType,
                    })),
                };
            }
        });
        console.log('create-image tool registered');
        // Zod schema for edit-image tool input (gpt-image-1 only)
        const absolutePathCheck = (val) => {
            if (!val)
                return true;
            // Check for Unix/Linux/macOS absolute paths
            if (val.startsWith("/"))
                return true;
            // Check for Windows absolute paths (C:/, D:\, etc.)
            if (/^[a-zA-Z]:[/\\]/.test(val))
                return true;
            return false;
        };
        const base64Check = (val) => !!val && (/^([A-Za-z0-9+/=\r\n]+)$/.test(val) || val.startsWith("data:image/"));
        // Base schema without refinement for server.tool signature
        const editImageBaseSchema = zod_1.z.object({
            image: zod_1.z.string().describe("Absolute image path or base64 string to edit."),
            prompt: zod_1.z.string().max(32000).describe("A text description of the desired edit. Max 32000 chars."),
            mask: zod_1.z.string().optional().describe("Optional absolute path or base64 string for a mask image (png < 4MB, same dimensions as the first image). Fully transparent areas indicate where to edit."),
            model: zod_1.z.literal("gpt-image-1").default("gpt-image-1"),
            n: zod_1.z.number().int().min(1).max(10).optional().describe("Number of images to generate (1-10)."),
            quality: zod_1.z.enum(["auto", "high", "medium", "low"]).optional().describe("Quality (high, medium, low) - only for gpt-image-1."),
            size: zod_1.z.enum(["1024x1024", "1536x1024", "1024x1536", "auto"]).optional().describe("Size of the generated images."),
            user: zod_1.z.string().optional().describe("Optional user identifier for OpenAI monitoring."),
            output: zod_1.z.enum(["base64", "file_output"]).default("base64").describe("Output format: base64 or file path."),
            file_output: zod_1.z.string().refine(absolutePathCheck, { message: "Path must be absolute" }).optional()
                .describe("Absolute path to save the output image file, including the desired file extension (e.g., /path/to/image.png). If n > 1, an index is appended."),
        });
        // Full schema with refinement for validation inside the handler
        const editImageSchema = editImageBaseSchema.refine((data) => {
            if (data.output !== "file_output")
                return true;
            if (typeof data.file_output !== "string")
                return false;
            return absolutePathCheck(data.file_output);
        }, { message: "file_output must be an absolute path when output is 'file_output'", path: ["file_output"] });
        // Edit Image Tool (gpt-image-1 only)
        server.tool("edit-image", editImageBaseSchema.shape, async (args, _extra) => {
            console.log('edit-image tool called with args:', JSON.stringify(args, null, 2));
            // Validate arguments using the full schema with refinements
            const validatedArgs = editImageSchema.parse(args);
            // Explicitly validate image and mask inputs here
            if (!absolutePathCheck(validatedArgs.image) && !base64Check(validatedArgs.image)) {
                throw new Error("Invalid 'image' input: Must be an absolute path or a base64-encoded string.");
            }
            if (validatedArgs.mask && !absolutePathCheck(validatedArgs.mask) && !base64Check(validatedArgs.mask)) {
                throw new Error("Invalid 'mask' input: Must be an absolute path or a base64-encoded string.");
            }
            const openai = process.env.AZURE_OPENAI_API_KEY ? new openai_1.AzureOpenAI() : new openai_1.OpenAI();
            const { image: imageInput, prompt, mask: maskInput, model = "gpt-image-1", n, quality, size, user, output = "base64", file_output: file_outputRaw, } = validatedArgs;
            const file_output = file_outputRaw;
            // Helper to convert input (path or base64) to toFile
            async function inputToFile(input, idx = 0) {
                if (absolutePathCheck(input)) {
                    // File path: infer mime type from extension
                    const ext = input.split('.').pop()?.toLowerCase();
                    let mime = "image/png";
                    if (ext === "jpg" || ext === "jpeg")
                        mime = "image/jpeg";
                    else if (ext === "webp")
                        mime = "image/webp";
                    else if (ext === "png")
                        mime = "image/png";
                    // else default to png
                    return await (0, openai_1.toFile)(fs_1.default.createReadStream(input), undefined, { type: mime });
                }
                else {
                    // Base64 or data URL
                    let base64 = input;
                    let mime = "image/png";
                    if (input.startsWith("data:image/")) {
                        // data URL
                        const match = input.match(/^data:(image\/\w+);base64,(.*)$/);
                        if (match) {
                            mime = match[1];
                            base64 = match[2];
                        }
                    }
                    const buffer = Buffer.from(base64, "base64");
                    return await (0, openai_1.toFile)(buffer, `input_${idx}.${mime.split("/")[1] || "png"}`, { type: mime });
                }
            }
            // Prepare image input
            const imageFile = await inputToFile(imageInput, 0);
            // Prepare mask input
            const maskFile = maskInput ? await inputToFile(maskInput, 1) : undefined;
            // Construct parameters for OpenAI API
            const editParams = {
                image: imageFile,
                prompt,
                model, // Always gpt-image-1
                ...(maskFile ? { mask: maskFile } : {}),
                ...(n ? { n } : {}),
                ...(quality ? { quality } : {}),
                ...(size ? { size } : {}),
                ...(user ? { user } : {}),
                // response_format is not applicable for gpt-image-1 (always b64_json)
            };
            console.log('Calling OpenAI edit API...');
            const result = await openai.images.edit(editParams);
            // gpt-image-1 always returns base64 images in data[].b64_json
            // We need to determine the output mime type and extension based on input/defaults
            // Since OpenAI doesn't return this for edits, we'll default to png
            const images = (result.data ?? []).map((img) => ({
                b64: img.b64_json,
                mimeType: "image/png",
                ext: "png",
            }));
            // Auto-switch to file_output if total base64 size exceeds 1MB
            const MAX_RESPONSE_SIZE = 1048576; // 1MB
            const totalBase64Size = images.reduce((sum, img) => sum + Buffer.byteLength(img.b64, "base64"), 0);
            let effectiveOutput = output;
            let effectiveFileOutput = file_output;
            if (output === "base64" && totalBase64Size > MAX_RESPONSE_SIZE) {
                effectiveOutput = "file_output";
                if (!file_output) {
                    // Use /tmp or MCP_HF_WORK_DIR if set
                    const tmpDir = process.env.MCP_HF_WORK_DIR || "/tmp";
                    const unique = Date.now();
                    effectiveFileOutput = path_1.default.join(tmpDir, `openai_image_edit_${unique}.png`);
                }
            }
            if (effectiveOutput === "file_output") {
                if (!effectiveFileOutput) {
                    throw new Error("file_output path is required when output is 'file_output'");
                }
                // Use fs/promises and path (already imported)
                const basePath = effectiveFileOutput;
                const responses = [];
                for (let i = 0; i < images.length; i++) {
                    const img = images[i];
                    let filePath = basePath;
                    if (images.length > 1) {
                        const parsed = path_1.default.parse(basePath);
                        // Append index before the original extension if it exists, otherwise just append index and .png
                        const ext = parsed.ext || `.${img.ext}`;
                        filePath = path_1.default.join(parsed.dir, `${parsed.name}_${i + 1}${ext}`);
                    }
                    else {
                        // Ensure the extension from the path is used, or default to .png
                        const parsed = path_1.default.parse(basePath);
                        const ext = parsed.ext || `.${img.ext}`;
                        filePath = path_1.default.join(parsed.dir, `${parsed.name}${ext}`);
                    }
                    await fs_1.default.promises.writeFile(filePath, Buffer.from(img.b64, "base64"));
                    // Workaround: Return file path as text
                    responses.push({ type: "text", text: `Image saved to: file://${filePath}` });
                }
                return { content: responses };
            }
            else {
                // Default: base64
                return {
                    content: images.map((img) => ({
                        type: "image",
                        data: img.b64,
                        mimeType: img.mimeType, // Should be image/png
                    })),
                };
            }
        });
        console.log('edit-image tool registered');
        console.log('Setting up transport...');
        const transport = new stdio_js_1.StdioServerTransport();
        console.log('Connecting to MCP transport...');
        await server.connect(transport);
        console.log('MCP Server connected and ready!');
    }
    catch (error) {
        console.error('Error starting MCP server:', error);
        process.exit(1);
    }
})();
