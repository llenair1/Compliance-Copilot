import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, MinusCircle, Shield, Download, ChevronDown, ChevronUp, FileText, Upload, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ControlResult {
  id: string;
  name: string;
  description: string;
  status: "Met" | "Partially Met" | "Not Found";
  rationale: string;
}

interface AnalyzeResponse {
  results: ControlResult[];
  overallScore: number;
}

const STATUS_CONFIG = {
  Met: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 border-green-200", badge: "bg-green-100 text-green-800" },
  "Partially Met": { icon: MinusCircle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", badge: "bg-amber-100 text-amber-800" },
  "Not Found": { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-800" },
};

function ControlCard({ result }: { result: ControlResult }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[result.status];
  const Icon = cfg.icon;
  return (
    <div className={`border rounded-lg overflow-hidden ${cfg.bg}`}>
      <button
        className="w-full flex items-center justify-between p-4 text-left hover:opacity-90 transition-opacity"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon className={`shrink-0 w-5 h-5 ${cfg.color}`} />
          <div className="min-w-0">
            <span className="font-mono text-xs text-gray-500 mr-2">{result.id}</span>
            <span className="font-semibold text-gray-900 text-sm">{result.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>{result.status}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-current border-opacity-20 space-y-2 pt-3">
          <p className="text-xs text-gray-500 italic">{result.description}</p>
          <p className="text-sm text-gray-700"><span className="font-semibold">Assessment: </span>{result.rationale}</p>
        </div>
      )}
    </div>
  );
}

function buildReport(results: ControlResult[], score: number): string {
  const met = results.filter(r => r.status === "Met").length;
  const partial = results.filter(r => r.status === "Partially Met").length;
  const notFound = results.filter(r => r.status === "Not Found").length;
  const gaps = results.filter(r => r.status !== "Met");

  const lines = [
    "AI COMPLIANCE READINESS COPILOT",
    "NIST CSF 2.0 Executive Compliance Report",
    "=".repeat(60),
    `Overall Compliance Score: ${score}%`,
    `Controls Met:             ${met} / ${results.length}`,
    `Partially Met:            ${partial}`,
    `Not Found:                ${notFound}`,
    "=".repeat(60),
    "",
    "CONTROL EVALUATION RESULTS",
    "-".repeat(60),
    ...results.flatMap(r => [
      `\n[${r.id}] ${r.name}`,
      `  Status:    ${r.status}`,
      `  Rationale: ${r.rationale}`,
    ]),
  ];

  if (gaps.length) {
    lines.push("", "", "GAP RECOMMENDATIONS", "-".repeat(60));
    gaps.forEach(g => {
      const priority = g.status === "Not Found" ? "HIGH" : "MEDIUM";
      lines.push(`[${priority}] ${g.id} - ${g.name}: ${g.rationale}`);
    });
  }

  return lines.join("\n");
}

export default function Home() {
  const [policyText, setPolicyText] = useState("");
  const [policyPdf, setPolicyPdf] = useState<File | null>(null);
  const [report, setReport] = useState<AnalyzeResponse | null>(null);

  const mutation = useMutation<AnalyzeResponse, Error, { text?: string; pdf?: File }>({
    mutationFn: async ({ text, pdf }) => {
      const res = pdf
        ? await fetch(`${BASE}/api/analyze/pdf`, {
            method: "POST",
            headers: { "Content-Type": "application/pdf" },
            body: pdf,
          })
        : await fetch(`${BASE}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ policyText: text }),
          });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Analysis failed");
      }
      return res.json();
    },
    onSuccess: (data) => setReport(data),
  });

  const handleAnalyze = () => {
    if (policyPdf) {
      mutation.mutate({ pdf: policyPdf });
      return;
    }

    if (policyText.trim().length < 50) return;
    mutation.mutate({ text: policyText });
  };

  const hasAnalyzableInput = Boolean(policyPdf) || policyText.trim().length >= 50;

  const handleDownload = () => {
    if (!report) return;
    const text = buildReport(report.results, report.overallScore);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nist_csf_compliance_report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const score = report?.overallScore ?? 0;
  const posture = score >= 80 ? { label: "Strong", color: "text-green-700", bg: "bg-green-50 border-green-300" }
    : score >= 50 ? { label: "Moderate", color: "text-amber-700", bg: "bg-amber-50 border-amber-300" }
    : { label: "Weak", color: "text-red-700", bg: "bg-red-50 border-red-300" };

  const met = report?.results.filter(r => r.status === "Met").length ?? 0;
  const gaps = report?.results.filter(r => r.status !== "Met").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">AI Compliance Readiness Copilot</h1>
        </div>
        <p className="text-gray-500 text-sm mb-8">
          Evaluate your policy document against <span className="font-semibold">10 NIST CSF 2.0 subcategories</span> and generate an executive compliance report.
        </p>

        {/* Input */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-semibold text-gray-700">Policy Document</label>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" />
              Upload PDF
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setPolicyPdf(file);
                  if (file) {
                    setReport(null);
                  }
                }}
              />
            </label>
          </div>
          <textarea
            className="w-full h-52 rounded-lg border border-gray-300 p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
            placeholder="Paste your information security policy, data protection policy, incident response plan, or any compliance document here..."
            value={policyText}
            onChange={e => {
              setPolicyText(e.target.value);
              if (e.target.value.trim()) {
                setPolicyPdf(null);
              }
            }}
          />
          {policyPdf && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0 text-blue-900">
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{policyPdf.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setPolicyPdf(null)}
                className="shrink-0 rounded-md p-1 text-blue-700 hover:bg-blue-100"
                aria-label="Remove selected PDF"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-gray-400">Analysis typically takes 10-20 seconds. Powered by GPT-4o.</p>
            <button
              onClick={handleAnalyze}
              disabled={mutation.isPending || !hasAnalyzableInput}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {mutation.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </>
              ) : "Analyze Policy"}
            </button>
          </div>
          {mutation.isError && (
            <p className="mt-2 text-sm text-red-600">{mutation.error.message}</p>
          )}
        </div>

        {/* Report */}
        {report && (
          <div className="space-y-6">
            {/* Score cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Overall Score</p>
                <p className="text-3xl font-bold text-gray-900">{score}%</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Controls Met</p>
                <p className="text-3xl font-bold text-gray-900">{met}<span className="text-lg text-gray-400">/{report.results.length}</span></p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
                <p className="text-xs text-gray-500 mb-1">Gaps Found</p>
                <p className="text-3xl font-bold text-gray-900">{gaps}</p>
              </div>
            </div>

            {/* Posture banner */}
            <div className={`rounded-xl border p-4 ${posture.bg}`}>
              <p className={`font-semibold ${posture.color}`}>
                Compliance Posture: {posture.label}
              </p>
              <p className="text-sm text-gray-600 mt-0.5">
                Overall score of {score}% against 10 NIST CSF 2.0 subcategories.
              </p>
            </div>

            {/* Controls */}
            <div>
              <h2 className="text-base font-semibold text-gray-900 mb-3">Control Evaluation Results</h2>
              <div className="space-y-2">
                {report.results.map(r => <ControlCard key={r.id} result={r} />)}
              </div>
            </div>

            {/* Gap recommendations */}
            {gaps > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-base font-semibold text-gray-900 mb-3">Gap Recommendations</h2>
                <ul className="space-y-2">
                  {report.results.filter(r => r.status !== "Met").map(g => (
                    <li key={g.id} className="flex gap-2 text-sm">
                      <span className={`shrink-0 font-semibold px-1.5 py-0.5 rounded text-xs ${g.status === "Not Found" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {g.status === "Not Found" ? "HIGH" : "MED"}
                      </span>
                      <span><span className="font-semibold text-gray-800">{g.id} - {g.name}:</span>{" "}<span className="text-gray-600">{g.rationale}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Report (.txt)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
