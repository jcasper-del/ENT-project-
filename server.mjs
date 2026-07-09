import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        hasKey: Boolean(OPENAI_API_KEY),
        model: OPENAI_MODEL,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/educational-answer") {
      const body = await readJsonBody(request);
      const prompt = String(body.prompt || "").trim();
      const patientSummary = String(body.patientSummary || "").trim();
      const goal = String(body.goal || "").trim();

      if (!prompt) {
        sendJson(response, 400, { error: "Missing prompt." });
        return;
      }

      const input =
        "Patient goal: " + (goal || "understand the situation safely") +
        "\n\nStructured summary:\n" + (patientSummary || "No structured patient profile supplied.") +
        "\n\nQuestion for the AI assistant:\n" + prompt;

      const text = await createOpenAIText({
        instructions:
          "You are a cautious head and neck cancer patient education assistant. " +
          "Give general educational information only, not diagnosis or treatment orders. " +
          "Use careful language, mention what depends on diagnosis, stage, biomarkers, pathology, prior treatment, and performance status. " +
          "Call out uncertainty, avoid absolute claims, mention important side effects or risks when relevant, " +
          "and end by telling the patient what to verify with their doctor or care team.",
        input,
      });

      sendJson(response, 200, { ok: true, model: OPENAI_MODEL, text });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/review-answer") {
      const body = await readJsonBody(request);
      const answer = String(body.answer || "").trim();
      const patientSummary = String(body.patientSummary || "").trim();

      if (!answer) {
        sendJson(response, 400, { error: "Missing answer to review." });
        return;
      }

      const input =
        "Patient summary:\n" + (patientSummary || "No structured patient profile supplied.") +
        "\n\nAI answer to review:\n" + answer;

      const text = await createOpenAIText({
        instructions:
          "You are reviewing a medical AI answer for safety. " +
          "Rewrite the answer in a more careful, patient-safe way. " +
          "Keep it educational, mention what depends on the exact diagnosis and staging, " +
          "note important uncertainties, warn against self-directed treatment changes, " +
          "and finish with a short bullet list of questions the patient should verify with the care team.",
        input,
      });

      sendJson(response, 200, { ok: true, model: OPENAI_MODEL, text });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    sendJson(response, statusCode, {
      error: error?.message || "Unexpected server error.",
    });
  }
});

server.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        rejectBody(createError(413, "Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!raw) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(raw));
      } catch {
        rejectBody(createError(400, "Invalid JSON body."));
      }
    });

    request.on("error", () => {
      rejectBody(createError(400, "Could not read request body."));
    });
  });
}

async function createOpenAIText({ instructions, input }) {
  if (!OPENAI_API_KEY) {
    throw createError(500, "OPENAI_API_KEY is not set on the server.");
  }

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      instructions,
      input,
    }),
  });

  const data = await safeJson(apiResponse);
  if (!apiResponse.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      `OpenAI request failed with status ${apiResponse.status}.`;
    throw createError(apiResponse.status, message);
  }

  const text = extractResponseText(data);
  if (!text) {
    throw createError(502, "OpenAI returned a response, but no readable text was found.");
  }

  return text;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];

  function visit(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (typeof node === "object") {
      if (node.type === "output_text" && typeof node.text === "string") {
        parts.push(node.text);
      }

      if (typeof node.text === "string" && !node.type) {
        parts.push(node.text);
      }

      if (node.output) visit(node.output);
      if (node.content) visit(node.content);
      if (node.items) visit(node.items);
    }
  }

  visit(data?.output);
  visit(data?.content);

  return parts.join("\n\n").trim();
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
