import { Router, type IRouter } from "express";
import OpenAI, { APIError } from "openai";

const router: IRouter = Router();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NIST_CONTROLS = [
  {
    id: "ID.AM",
    name: "Asset Inventory",
    description:
      "Physical devices, software platforms, and systems within the organization are inventoried.",
  },
  {
    id: "ID.RA",
    name: "Risk Assessment",
    description:
      "Cybersecurity risks are identified, assessed, and documented to understand likelihood and impact.",
  },
  {
    id: "PR.AA",
    name: "Identity & Access Management",
    description:
      "Access to assets and associated facilities is limited to authorized users and processes.",
  },
  {
    id: "PR.AT",
    name: "Security Awareness Training",
    description:
      "Personnel and partners are provided cybersecurity awareness education and trained to perform duties.",
  },
  {
    id: "PR.DS",
    name: "Data Protection",
    description:
      "Information and records are managed in a manner consistent with risk strategy to protect confidentiality, integrity, and availability.",
  },
  {
    id: "DE.CM",
    name: "Security Monitoring",
    description:
      "The network and assets are monitored to identify cybersecurity events.",
  },
  {
    id: "DE.AE",
    name: "Anomaly Detection",
    description:
      "Anomalous activity is detected and the potential impact of events is understood.",
  },
  {
    id: "RS.RP",
    name: "Incident Response Plan",
    description:
      "Response processes and procedures are executed and maintained to ensure response to detected cybersecurity incidents.",
  },
  {
    id: "RC.RP",
    name: "Recovery Planning",
    description:
      "Recovery processes and procedures are executed and maintained to ensure restoration of systems or assets.",
  },
  {
    id: "RC.CO",
    name: "Communication & Improvement",
    description:
      "Restoration activities are coordinated with internal and external parties, and recovery planning is improved.",
  },
];

router.post("/analyze", async (req, res) => {
  const { policyText } = req.body as { policyText?: string };

  if (!policyText || policyText.trim().length < 50) {
    res.status(400).json({ error: "Policy document is too short or missing." });
    return;
  }

  const controlsJson = JSON.stringify(
    NIST_CONTROLS.map(({ id, name, description }) => ({
      id,
      name,
      description,
    })),
    null,
    2,
  );

  const prompt = `You are a cybersecurity compliance expert specializing in NIST Cybersecurity Framework (CSF) 2.0.

Analyze the following policy document and evaluate it against each of the provided NIST CSF 2.0 subcategories.

For each control, respond with:
- "status": one of exactly "Met", "Partially Met", or "Not Found"
- "rationale": a single sentence explaining your assessment based on evidence (or lack thereof) in the document

NIST CSF 2.0 Controls to evaluate:
${controlsJson}

Policy Document:
"""
${policyText}
"""

Respond ONLY with a valid JSON object containing a "results" array. Each element must have: "id", "status", and "rationale".
Example format:
{"results": [{"id": "ID.AM", "status": "Met", "rationale": "The policy explicitly defines an asset inventory process covering hardware, software, and data assets."}, ...]}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      results?: Array<{ id: string; status: string; rationale: string }>;
    };

    const resultsList = parsed.results ?? [];
    const resultById = Object.fromEntries(resultsList.map((r) => [r.id, r]));

    const STATUS_SCORES: Record<string, number> = {
      Met: 1.0,
      "Partially Met": 0.5,
      "Not Found": 0.0,
    };

    const finalResults = NIST_CONTROLS.map((ctrl) => {
      const match = resultById[ctrl.id] ?? {};
      return {
        id: ctrl.id,
        name: ctrl.name,
        description: ctrl.description,
        status: (match.status as string) || "Not Found",
        rationale: match.rationale || "No rationale provided.",
      };
    });

    const totalScore =
      finalResults.reduce(
        (sum, r) => sum + (STATUS_SCORES[r.status] ?? 0),
        0,
      ) / finalResults.length;

    res.json({
      results: finalResults,
      overallScore: Math.round(totalScore * 1000) / 10,
    });
  } catch (err) {
    if (err instanceof APIError) {
      const status = err.status ?? 500;
      let message = "OpenAI API error. Please try again.";
      if (status === 401) {
        message =
          "Invalid OpenAI API key. Please check the OPENAI_API_KEY secret.";
      } else if (status === 429) {
        message =
          "OpenAI quota exceeded. Please add billing credits at platform.openai.com/settings/billing.";
      } else if (status === 503 || status === 529) {
        message = "OpenAI is temporarily overloaded. Please try again shortly.";
      }
      res.status(status < 500 ? status : 502).json({ error: message });
    } else {
      res.status(500).json({ error: "An unexpected server error occurred." });
    }
  }
});

export default router;
